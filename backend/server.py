import os
import re

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import execute_algorithmic_quality_gate

server_app = FastAPI(title="GenAI Test Automation Server Engine", version="1.0.0")

server_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # "*" origins cannot be combined with credentials
    allow_methods=["*"],
    allow_headers=["*"],
)


class PRDPayload(BaseModel):
    requirement_text: str


KEYWORD_RE = re.compile(r"^(Given|When|Then|And|But)\b", re.IGNORECASE)


def with_keyword(step: str, keyword: str) -> str:
    """Make sure every step starts with a Gherkin keyword."""
    step = step.strip()
    return step if KEYWORD_RE.match(step) else f"{keyword} {step}"


def build_gherkin(suite) -> str:
    lines = [f"Feature: {suite.feature_name}"]
    for desc_line in suite.feature_description.strip().splitlines():
        lines.append(f"  {desc_line.strip()}")
    lines.append("")

    for sc in suite.scenarios:
        lines.append(f"  Scenario: {sc.scenario_title}")
        lines.append(f"    {with_keyword(sc.given_step, 'Given')}")
        for i, step in enumerate(sc.when_steps):
            lines.append(f"    {with_keyword(step, 'When' if i == 0 else 'And')}")
        for i, step in enumerate(sc.then_steps):
            lines.append(f"    {with_keyword(step, 'Then' if i == 0 else 'And')}")
        lines.append("")
    return "\n".join(lines)


def safe_filename(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:30]
    return (slug or "feature") + ".feature"


@server_app.get("/")
def root():
    return {"status": "ok", "docs": "/docs"}


# Plain `def` (not async): FastAPI runs it in a threadpool, so the slow
# Ollama call does not freeze the rest of the server.
@server_app.post("/api/v1/generate-test-suite")
def process_test_suite_pipeline(payload: PRDPayload):
    if not payload.requirement_text.strip():
        raise HTTPException(status_code=400, detail="Requirement text cannot be empty.")

    try:
        suite = execute_algorithmic_quality_gate(payload.requirement_text)

        output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "features"))
        os.makedirs(output_dir, exist_ok=True)
        target_path = os.path.join(output_dir, safe_filename(suite.feature_name))

        gherkin = build_gherkin(suite)
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(gherkin)

        return {
            "status": "success",
            "file_written_to": target_path,
            "raw_gherkin": gherkin,
            "structured_json": suite,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Engine Error: {e}")


class ScenarioIn(BaseModel):
    scenario_title: str
    given_step: str
    when_steps: list[str]
    then_steps: list[str]


class FeatureIn(BaseModel):
    feature_name: str
    feature_description: str
    scenarios: list[ScenarioIn]


@server_app.post("/api/v1/save-feature")
def save_feature(feature: FeatureIn):
    """Write the reviewed (edited/approved) scenarios to a .feature file."""
    if not feature.scenarios:
        raise HTTPException(status_code=400, detail="Keep at least one scenario before saving.")

    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "features"))
    os.makedirs(output_dir, exist_ok=True)
    target_path = os.path.join(output_dir, safe_filename(feature.feature_name))

    gherkin = build_gherkin(feature)
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(gherkin)

    return {"status": "saved", "file_written_to": target_path, "raw_gherkin": gherkin}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:server_app", host="127.0.0.1", port=8000, reload=True)