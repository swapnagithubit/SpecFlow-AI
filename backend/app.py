import re
from typing import List

import httpx
from pydantic import BaseModel, Field
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.exceptions import OutputParserException

# ========================================================
# 1. SCHEMAS
# ========================================================
class ScenarioBlock(BaseModel):
    scenario_title: str = Field(description="A distinct, descriptive title outlining what unique user path this scenario validates.")
    given_step: str = Field(description="The baseline system state. Must start with 'Given'")
    when_steps: List[str] = Field(description="Actions executed by the user. Each starts with 'When' or 'And'")
    then_steps: List[str] = Field(description="Observable outcomes. Each starts with 'Then' or 'And'")


class BDDFeatureSuite(BaseModel):
    feature_name: str = Field(description="High-level title of the functional flow.")
    feature_description: str = Field(description="Short paragraph describing the business value.")
    scenarios: List[ScenarioBlock] = Field(description="Happy paths plus defensive edge cases.")


# ========================================================
# 2. LLM PIPELINE
# ========================================================
llm = ChatOllama(
    model="llama3.1",
    temperature=0.1,
    num_predict=2500,   # cap output so a rambling answer cannot run forever
    keep_alive="30m",   # keep the model loaded between requests
)
parser = PydanticOutputParser(pydantic_object=BDDFeatureSuite)

# NOTE: no literal curly braces in this text, except the {format_instructions} placeholder.
system_instruction = (
    "You are a senior QA Automation Lead specialized in Behavior-Driven Development (BDD).\n"
    "Convert the requirement into a Gherkin test suite.\n\n"
    "Rules:\n"
    "- Write 6 to 10 scenarios covering: happy path, invalid input, boundary values "
    "(just below the limit, exactly at the limit), state changes, and recovery/reset.\n"
    "- Every scenario must test something different. No duplicates.\n"
    "- Given steps describe system STATE, not inputs.\n"
    "- Put every email address, password, and message in quotes, e.g. 'user@example.com', 'Wrong#123'. "
    "Never write 'a valid email' or 'an incorrect password' without the quoted value.\n"
    "- Then steps must name a concrete observable result (redirect target, exact error message, lock status).\n"
    "- Time-based behavior must use a controllable clock step such as 'When 15 minutes have passed'.\n"
    "- One behavior per scenario. The scenario title must match what the Then steps assert.\n"
    "- Do not invent features that are not in the requirement.\n"
    "- Count carefully: if a rule triggers after N failures, the Nth failure triggers it. "
    "Given N-1 prior failures plus one more failure triggers the rule; N-2 prior failures plus one more does not.\n"
    "- Never write two scenarios with the same Given and When but different Then steps.\n"
    "- A scenario that logs in successfully after a lock must say that the lock time has passed in its Given or When.\n"
    "- Always include: a case just below the limit that does NOT trigger the rule and asserts the account is not locked, "
    "a case exactly at the limit, and a case where the correct password is rejected while the rule is active.\n"
    "- Also cover: the rule still active just before a time limit expires, normal behavior right after it expires, "
    "and a successful action resetting any counter.\n"
    "- Return ONLY the structured output. No introductions, no markdown.\n\n"
    "Example of the expected step style (different feature, for style only):\n"
    "Scenario: Cart accepts the 10th item\n"
    "  Given a cart containing 9 items\n"
    "  When the shopper adds the item 'SKU-100'\n"
    "  Then the cart shows 10 items\n"
    "  And the message 'Item added' is shown\n\n"
    "Data Structure Guidelines:\n{format_instructions}"
)

prompt_template = ChatPromptTemplate.from_messages([
    ("system", system_instruction),
    ("user", "Requirement:\n\n{prd_text}\n\n{feedback_context}"),
])

chain = prompt_template | llm | parser


# ========================================================
# 3. QUALITY CHECKS
# ========================================================
MIN_SCENARIOS = 6
VAGUE_RE = re.compile(
    r"\b(appropriate|appropriately|properly|recorded as failed|handled correctly)\b",
    re.IGNORECASE,
)
# Matches quoted data ('x' or "x") or an email address
CONCRETE_RE = re.compile(r"['\"][^'\"]+['\"]|\S+@\S+")


def _norm(steps) -> tuple:
    return tuple(s.strip().lower() for s in steps)


def drop_duplicate_scenarios(suite: BDDFeatureSuite) -> BDDFeatureSuite:
    """Remove scenarios whose steps are identical to an earlier one (titles may differ)."""
    seen, unique = set(), []
    for sc in suite.scenarios:
        key = (sc.given_step.strip().lower(), _norm(sc.when_steps), _norm(sc.then_steps))
        if key not in seen:
            seen.add(key)
            unique.append(sc)
    suite.scenarios = unique
    return suite


def find_quality_issues(suite: BDDFeatureSuite) -> List[str]:
    issues = []

    if len(suite.scenarios) < MIN_SCENARIOS:
        issues.append(
            f"Only {len(suite.scenarios)} distinct scenarios; write at least {MIN_SCENARIOS}, "
            "including boundary cases."
        )

    seen_titles = set()
    for sc in suite.scenarios:
        title = sc.scenario_title.strip().lower()
        if title in seen_titles:
            issues.append(f"Duplicate scenario title: '{sc.scenario_title}'.")
        seen_titles.add(title)

        if not sc.when_steps or not sc.then_steps:
            issues.append(f"Scenario '{sc.scenario_title}' needs at least one When and one Then step.")

        if not any(CONCRETE_RE.search(s) for s in [sc.given_step, *sc.when_steps]):
            issues.append(
                f"Scenario '{sc.scenario_title}' has no concrete data. Put the email in quotes "
                "(e.g. 'user@example.com') and quote any password or message used."
            )

        for step in [sc.given_step, *sc.when_steps, *sc.then_steps]:
            if VAGUE_RE.search(step):
                issues.append(
                    f"Vague step in '{sc.scenario_title}': \"{step}\". "
                    "Use a concrete, observable result or example data."
                )
                break

    # Contradiction check: same Given + When but different Then
    seen_setups = {}
    for sc in suite.scenarios:
        setup = (sc.given_step.strip().lower(), _norm(sc.when_steps))
        outcome = _norm(sc.then_steps)
        if setup in seen_setups and seen_setups[setup][1] != outcome:
            issues.append(
                f"Scenarios '{seen_setups[setup][0]}' and '{sc.scenario_title}' have identical Given and When "
                "steps but different Then steps, so they contradict each other. "
                "Change the Given or When of one so they test different situations."
            )
        seen_setups.setdefault(setup, (sc.scenario_title, outcome))

    return issues


# ========================================================
# 4. SELF-CORRECTING LOOP
# ========================================================
def execute_algorithmic_quality_gate(prd_data: str, max_retries: int = 3) -> BDDFeatureSuite:
    feedback = ""
    best_effort = None  # last schema-valid result, returned if quality checks never fully pass

    for run in range(1, max_retries + 1):
        try:
            suite = chain.invoke({
                "prd_text": prd_data,
                "format_instructions": parser.get_format_instructions(),
                "feedback_context": feedback,
            })
        except OutputParserException as e:
            print(f"[Run {run}] Malformed output: {str(e)[:300]}")
            feedback = (
                "Your previous answer was not valid for the required schema. "
                f"Error: {str(e)[:500]}\nReturn only valid structured output."
            )
            continue
        except (ConnectionError, httpx.ConnectError) as e:
            # Ollama is not running; retrying will not help
            raise RuntimeError("Cannot reach Ollama at localhost:11434. Is it running?") from e
        except Exception as e:
            print(f"[Run {run}] Unexpected pipeline error: {e}")
            feedback = f"A pipeline error occurred: {str(e)[:300]}\nReturn only valid structured output."
            continue

        suite = drop_duplicate_scenarios(suite)
        best_effort = suite

        issues = find_quality_issues(suite)
        if not issues:
            print(f"[Run {run}] Passed quality gate with {len(suite.scenarios)} scenarios.")
            return suite

        print(f"[Run {run}] Quality issues: {issues}")
        feedback = "Your previous attempt had these problems. Fix all of them:\n- " + "\n- ".join(issues[:8])

    if best_effort is not None:
        print("Quality gate not fully satisfied; returning best attempt.")
        return best_effort

    raise RuntimeError("The model failed to produce valid structured output after all retries.")