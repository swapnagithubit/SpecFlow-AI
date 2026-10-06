document.addEventListener("DOMContentLoaded", () => {
    const API = "http://127.0.0.1:8000/api/v1";

    const EXAMPLE =
        "Users can log in with email and password. " +
        "After 5 failed attempts, the account is locked for 15 minutes. " +
        "The user should see an error message when invalid credentials are entered.";

    const $ = (id) => document.getElementById(id);

    // =========================================================
    // DOM ELEMENTS
    // =========================================================

    const input = $("prd-input");
    const analyzeBtn = $("analyze-btn");
    const genBtn = $("generate-btn");
    const saveBtn = $("save-btn");

    const analysisPanel = $("analysis-panel");
    const analysisContent = $("analysis-content");

    const analysisFeature = $("analysis-feature");
    const analysisActors = $("analysis-actors");
    const analysisRequirements = $("analysis-requirements");
    const analysisRules = $("analysis-rules");
    const analysisConstraints = $("analysis-constraints");
    const analysisAmbiguities = $("analysis-ambiguities");

    const badge = $("status-badge");
    const list = $("review-list");
    const count = $("count");

    const views = {
        empty: $("empty"),
        loading: $("loading"),
        error: $("error"),
        review: list
    };

    let feature = null;

    // =========================================================
    // HELPERS
    // =========================================================

    const STRIP = /^(given|when|then|and|but)\s+/i;

    function normalizeText(value) {
        if (value === null || value === undefined) {
            return "";
        }

        if (typeof value === "string") {
            return value.trim();
        }

        return String(value).trim();
    }

    function stripKeyword(value) {
        return normalizeText(value)
            .replace(STRIP, "")
            .trim();
    }

    function normalizeSteps(value) {
        if (value === null || value === undefined) {
            return [];
        }

        if (Array.isArray(value)) {
            return value
                .map(normalizeText)
                .map(stripKeyword)
                .filter(Boolean);
        }

        if (typeof value === "string") {
            const text = stripKeyword(value);

            if (!text) {
                return [];
            }

            return [text];
        }

        return [];
    }

    function setBadge(text, cls = "") {
        if (!badge) {
            return;
        }

        badge.textContent = text;
        badge.className = `pill ${cls}`;
    }

    function setSave(text, isError = false) {
        const status = $("save-status");

        if (!status) {
            return;
        }

        status.textContent = text;
        status.className = isError ? "error muted" : "muted";
    }

    function show(name) {
        Object.entries(views).forEach(([key, element]) => {
            if (element) {
                element.hidden = key !== name;
            }
        });

        const saveBar = $("save-bar");

        if (saveBar) {
            saveBar.hidden = name !== "review";
        }

        if (name !== "review") {
            const savedDetails = $("saved-details");

            if (savedDetails) {
                savedDetails.hidden = true;
            }

            if (count) {
                count.textContent = "";
            }
        }
    }

    function updateCount() {
        if (!list) {
            return;
        }

        const number = list.querySelectorAll(".card").length;

        if (count) {
            count.textContent =
                `${number} ${number === 1 ? "scenario" : "scenarios"}`;
        }
    }

    function showError(message) {
        const errorElement = $("error-message");

        if (errorElement) {
            errorElement.textContent = message;
        }

        show("error");
        setBadge("Error", "error");
    }

    async function readJSON(response) {
        const text = await response.text();

        if (!text) {
            return {};
        }

        try {
            return JSON.parse(text);
        } catch {
            throw new Error(
                `Server returned invalid JSON. Status: ${response.status}`
            );
        }
    }

    // =========================================================
    // REQUIREMENT ANALYSIS
    // =========================================================

    function fillAnalysisList(container, items) {
        if (!container) {
            return;
        }

        container.replaceChildren();

        if (!items || items.length === 0) {
            const li = document.createElement("li");
            li.textContent = "None";
            container.appendChild(li);
            return;
        }

        items.forEach((item) => {
            const li = document.createElement("li");

            if (typeof item === "object" && item !== null) {
                if (item.description) {
                    li.textContent =
                        `${item.requirement_id || ""} ${item.description}`.trim();
                } else if (item.issue) {
                    li.textContent = item.issue;
                } else {
                    li.textContent = JSON.stringify(item);
                }
            } else {
                li.textContent = normalizeText(item);
            }

            container.appendChild(li);
        });
    }

    function renderAnalysis(data) {
        if (!data) {
            return;
        }

        if (analysisFeature) {
            analysisFeature.textContent =
                normalizeText(data.feature_name) || "Not identified";
        }

        fillAnalysisList(
            analysisActors,
            data.actors || []
        );

        fillAnalysisList(
            analysisRequirements,
            data.requirements || []
        );

        fillAnalysisList(
            analysisRules,
            data.business_rules || []
        );

        fillAnalysisList(
            analysisConstraints,
            data.constraints || []
        );

        fillAnalysisList(
            analysisAmbiguities,
            data.ambiguities || []
        );

        if (analysisPanel) {
            analysisPanel.hidden = false;
        }

        if (analysisContent) {
            analysisContent.hidden = false;
        }
    }

    async function analyzeRequirement() {
        const requirement = normalizeText(input?.value);

        if (!requirement) {
            alert("Please enter a software requirement first.");
            return;
        }

        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.textContent = "Analyzing...";
        }

        try {
            const response = await fetch(
                `${API}/analyze-requirement`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        requirement_text: requirement
                    })
                }
            );

            const data = await readJSON(response);

            if (!response.ok) {
                throw new Error(
                    data.detail || "Requirement analysis failed."
                );
            }

            console.log("REQUIREMENT ANALYSIS RESPONSE:", data);

            renderAnalysis(data.analysis || data);

            setBadge("Analyzed", "success");

        } catch (error) {
            console.error("Analysis error:", error);
            alert(error.message || "Requirement analysis failed.");
        } finally {
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = "Analyze Requirement";
            }
        }
    }

    // =========================================================
    // SCENARIO NORMALIZATION
    // =========================================================

    function normalizeScenario(raw, index) {
        if (!raw || typeof raw !== "object") {
            return {
                scenario_id: `TC-${String(index + 1).padStart(3, "0")}`,
                scenario_title: `Scenario ${index + 1}`,
                requirement_ids: [],
                test_type: "POSITIVE",
                given_step: "",
                when_steps: [],
                then_steps: []
            };
        }

        const scenarioId =
            raw.scenario_id ||
            raw.id ||
            raw.test_case_id ||
            `TC-${String(index + 1).padStart(3, "0")}`;

        const title =
            raw.scenario_title ||
            raw.title ||
            raw.name ||
            `Scenario ${index + 1}`;

        const requirementIds =
            raw.requirement_ids ||
            raw.requirements ||
            raw.requirementIds ||
            [];

        const testType =
            raw.test_type ||
            raw.type ||
            "POSITIVE";

        let given =
            raw.given_step ??
            raw.given ??
            raw.givenStep ??
            "";

        let when =
            raw.when_steps ??
            raw.when ??
            raw.whenSteps ??
            [];

        let then =
            raw.then_steps ??
            raw.then ??
            raw.thenSteps ??
            [];

        /*
         * Some LLM outputs may return Given/When/Then as strings
         * containing multiple lines. Handle that safely.
         */

        if (Array.isArray(given)) {
            given = given[0] || "";
        }

        given = stripKeyword(given);

        when = normalizeSteps(when);
        then = normalizeSteps(then);

        /*
         * Fallback for alternative backend format:
         *
         * {
         *   steps: [
         *      {keyword:"Given", text:"..."},
         *      {keyword:"When", text:"..."},
         *      {keyword:"Then", text:"..."}
         *   ]
         * }
         */

        if (
            !given &&
            when.length === 0 &&
            then.length === 0 &&
            Array.isArray(raw.steps)
        ) {
            raw.steps.forEach((step) => {
                if (!step) {
                    return;
                }

                const keyword = normalizeText(
                    step.keyword || step.type || ""
                ).toLowerCase();

                const text = stripKeyword(
                    step.text ||
                    step.value ||
                    step.step ||
                    ""
                );

                if (!text) {
                    return;
                }

                if (keyword === "given") {
                    if (!given) {
                        given = text;
                    }
                } else if (keyword === "when") {
                    when.push(text);
                } else if (keyword === "then") {
                    then.push(text);
                }
            });
        }

        /*
         * Final fallback if the backend uses a generic step list.
         */

        if (
            !given &&
            when.length === 0 &&
            then.length === 0 &&
            Array.isArray(raw.scenario_steps)
        ) {
            raw.scenario_steps.forEach((step) => {
                const text = stripKeyword(step);

                if (!text) {
                    return;
                }

                if (!given) {
                    given = text;
                } else if (when.length === 0) {
                    when.push(text);
                } else {
                    then.push(text);
                }
            });
        }

        return {
            scenario_id: normalizeText(scenarioId),
            scenario_title: normalizeText(title),
            requirement_ids: Array.isArray(requirementIds)
                ? requirementIds.map(normalizeText).filter(Boolean)
                : [],
            test_type: normalizeText(testType).toUpperCase(),
            given_step: given,
            when_steps: when,
            then_steps: then
        };
    }

    // =========================================================
    // STEP ROW
    // =========================================================

    function stepRow(text, removable = true) {
        const row = document.createElement("div");
        row.className = "step-row";

        const inputElement = document.createElement("input");

        inputElement.type = "text";
        inputElement.className = "step-input";
        inputElement.value = normalizeText(text);
        inputElement.placeholder = "Enter step...";

        row.appendChild(inputElement);

        if (removable) {
            const deleteButton = document.createElement("button");

            deleteButton.type = "button";
            deleteButton.className = "icon-button";
            deleteButton.textContent = "×";
            deleteButton.title = "Delete step";

            deleteButton.addEventListener("click", () => {
                row.remove();
            });

            row.appendChild(deleteButton);
        }

        return row;
    }

    // =========================================================
    // STEP GROUP
    // =========================================================

    function group(label, values, removable = true) {
        const wrapper = document.createElement("div");
        wrapper.className = "step-group";

        const header = document.createElement("div");
        header.className = "step-group-header";

        const title = document.createElement("span");
        title.className = "step-label";
        title.textContent = label;

        header.appendChild(title);

        if (removable) {
            const addButton = document.createElement("button");

            addButton.type = "button";
            addButton.className = "small-button";
            addButton.textContent = "+ Add";

            addButton.addEventListener("click", () => {
                const row = stepRow("", true);
                rows.appendChild(row);

                const inputElement = row.querySelector("input");

                if (inputElement) {
                    inputElement.focus();
                }
            });

            header.appendChild(addButton);
        }

        wrapper.appendChild(header);

        const rows = document.createElement("div");
        rows.className = "step-rows";

        if (!Array.isArray(values)) {
            values = [];
        }

        if (values.length === 0) {
            rows.appendChild(stepRow("", removable));
        } else {
            values.forEach((value) => {
                rows.appendChild(
                    stepRow(value, removable)
                );
            });
        }

        wrapper.appendChild(rows);

        return wrapper;
    }

    // =========================================================
    // BUILD SCENARIO CARD
    // =========================================================

    function buildCard(scenario, index) {
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.index = index;

        // -----------------------------------------------------
        // CARD HEADER
        // -----------------------------------------------------

        const header = document.createElement("div");
        header.className = "card-header";

        const headerLeft = document.createElement("div");

        const id = document.createElement("span");
        id.className = "scenario-id";
        id.textContent = scenario.scenario_id;

        const title = document.createElement("input");
        title.type = "text";
        title.className = "scenario-title";
        title.value = scenario.scenario_title;
        title.placeholder = "Scenario title";

        headerLeft.appendChild(id);
        headerLeft.appendChild(title);

        const deleteScenario = document.createElement("button");
        deleteScenario.type = "button";
        deleteScenario.className = "danger-button";
        deleteScenario.textContent = "Delete";

        deleteScenario.addEventListener("click", () => {
            card.remove();
            updateCount();

            if (list && list.querySelectorAll(".card").length === 0) {
                show("empty");
            }
        });

        header.appendChild(headerLeft);
        header.appendChild(deleteScenario);

        card.appendChild(header);

        // -----------------------------------------------------
        // META
        // -----------------------------------------------------

        const meta = document.createElement("div");
        meta.className = "scenario-meta";

        const typeLabel = document.createElement("span");
        typeLabel.className = "type-badge";
        typeLabel.textContent =
            scenario.test_type || "POSITIVE";

        meta.appendChild(typeLabel);

        if (
            Array.isArray(scenario.requirement_ids) &&
            scenario.requirement_ids.length > 0
        ) {
            const reqLabel = document.createElement("span");
            reqLabel.className = "requirement-badge";
            reqLabel.textContent =
                scenario.requirement_ids.join(", ");

            meta.appendChild(reqLabel);
        }

        card.appendChild(meta);

        // -----------------------------------------------------
        // GIVEN
        // -----------------------------------------------------

        card.appendChild(
            group(
                "Given",
                [scenario.given_step],
                false
            )
        );

        // -----------------------------------------------------
        // WHEN
        // -----------------------------------------------------

        card.appendChild(
            group(
                "When",
                scenario.when_steps,
                true
            )
        );

        // -----------------------------------------------------
        // THEN
        // -----------------------------------------------------

        card.appendChild(
            group(
                "Then",
                scenario.then_steps,
                true
            )
        );

        return card;
    }

    // =========================================================
    // COLLECT SCENARIOS FROM UI
    // =========================================================

    function collectScenarios() {
        if (!list) {
            return [];
        }

        const cards = list.querySelectorAll(".card");

        return Array.from(cards).map((card, index) => {
            const titleInput =
                card.querySelector(".scenario-title");

            const typeBadge =
                card.querySelector(".type-badge");

            const requirementBadge =
                card.querySelector(".requirement-badge");

            const groups =
                card.querySelectorAll(".step-group");

            let givenStep = "";
            let whenSteps = [];
            let thenSteps = [];

            groups.forEach((groupElement) => {
                const label =
                    groupElement
                        .querySelector(".step-label")
                        ?.textContent
                        ?.trim()
                        ?.toLowerCase();

                const inputs =
                    groupElement.querySelectorAll(
                        ".step-input"
                    );

                const values = Array.from(inputs)
                    .map((inputElement) =>
                        stripKeyword(inputElement.value)
                    )
                    .filter(Boolean);

                if (label === "given") {
                    givenStep = values[0] || "";
                } else if (label === "when") {
                    whenSteps = values;
                } else if (label === "then") {
                    thenSteps = values;
                }
            });

            let requirementIds = [];

            if (requirementBadge) {
                requirementIds =
                    requirementBadge.textContent
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean);
            }

            return {
                scenario_id:
                    card.querySelector(".scenario-id")
                        ?.textContent
                        ?.trim() ||
                    `TC-${String(index + 1).padStart(3, "0")}`,

                scenario_title:
                    normalizeText(
                        titleInput?.value
                    ) ||
                    `Scenario ${index + 1}`,

                requirement_ids:
                    requirementIds,

                test_type:
                    normalizeText(
                        typeBadge?.textContent
                    ).toUpperCase() ||
                    "POSITIVE",

                given_step: givenStep,

                when_steps: whenSteps,

                then_steps: thenSteps
            };
        });
    }

    // =========================================================
    // GENERATE TEST SUITE
    // =========================================================

    async function generateTestSuite() {
        const requirement = normalizeText(
            input?.value
        );

        if (!requirement) {
            alert("Please enter a requirement first.");
            return;
        }

        show("loading");
        setBadge("Generating...", "loading");
        setSave("");

        if (genBtn) {
            genBtn.disabled = true;
            genBtn.textContent = "Generating...";
        }

        try {
            const response = await fetch(
                `${API}/generate-test-suite`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        requirement_text: requirement
                    })
                }
            );

            const data = await readJSON(response);

            // Very important debugging information.
            console.log(
                "FULL BACKEND RESPONSE:",
                data
            );

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    "Test generation failed."
                );
            }

            const structured =
                data.structured_json ||
                data.feature ||
                data;

            console.log(
                "STRUCTURED JSON:",
                structured
            );

            let rawScenarios =
                structured.scenarios ||
                data.scenarios ||
                [];

            console.log(
                "SCENARIOS FROM BACKEND:",
                rawScenarios
            );

            if (!Array.isArray(rawScenarios)) {
                rawScenarios = [];
            }

            const scenarios =
                rawScenarios.map(
                    normalizeScenario
                );

            scenarios.forEach((scenario) => {
                console.log(
                    "NORMALIZED SCENARIO:",
                    scenario
                );
            });

            if (scenarios.length === 0) {
                throw new Error(
                    "The backend returned no scenarios."
                );
            }

            feature = {
                feature_name:
                    normalizeText(
                        structured.feature_name ||
                        structured.featureName ||
                        "Generated Feature"
                    ),

                feature_description:
                    normalizeText(
                        structured.feature_description ||
                        structured.featureDescription ||
                        ""
                    ),

                scenarios
            };

            // -------------------------------------------------
            // RENDER
            // -------------------------------------------------

            if (list) {
                list.replaceChildren();

                feature.scenarios.forEach(
                    (scenario, index) => {
                        list.appendChild(
                            buildCard(
                                scenario,
                                index
                            )
                        );
                    }
                );
            }

            updateCount();
            show("review");

            setBadge(
                `${feature.scenarios.length} Scenarios`,
                "success"
            );

            setSave(
                "Review the generated scenarios before saving."
            );

        } catch (error) {
            console.error(
                "Generation error:",
                error
            );

            showError(
                error.message ||
                "Unable to generate test scenarios."
            );

        } finally {
            if (genBtn) {
                genBtn.disabled = false;
                genBtn.textContent =
                    "Generate Test Scenarios";
            }
        }
    }

    // =========================================================
    // SAVE FEATURE
    // =========================================================

    async function saveFeature() {
        if (!feature) {
            alert(
                "Generate test scenarios before saving."
            );
            return;
        }

        const scenarios =
            collectScenarios();

        if (scenarios.length === 0) {
            alert(
                "Keep at least one scenario before saving."
            );
            return;
        }

        const featureName =
            feature.feature_name ||
            "Generated Feature";

        const featureDescription =
            feature.feature_description ||
            "";

        const payload = {
            feature_name: featureName,
            feature_description:
                featureDescription,
            scenarios
        };

        console.log(
            "SAVE PAYLOAD:",
            payload
        );

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving...";
        }

        setSave("Saving...");

        try {
            const response = await fetch(
                `${API}/save-feature`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body:
                        JSON.stringify(payload)
                }
            );

            const data =
                await readJSON(response);

            console.log(
                "SAVE RESPONSE:",
                data
            );

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    "Unable to save feature."
                );
            }

            setSave(
                "Feature saved successfully."
            );

            const savedDetails =
                $("saved-details");

            if (savedDetails) {
                savedDetails.hidden = false;
            }

            const savedPath =
                $("saved-path");

            if (savedPath) {
                savedPath.textContent =
                    data.file_written_to ||
                    "features/*.feature";
            }

            setBadge(
                "Saved",
                "success"
            );

        } catch (error) {
            console.error(
                "Save error:",
                error
            );

            setSave(
                error.message ||
                "Unable to save feature.",
                true
            );

        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent =
                    "Save .feature File";
            }
        }
    }

    // =========================================================
    // EXAMPLE REQUIREMENT
    // =========================================================

    function loadExample() {
        if (!input) {
            return;
        }

        input.value = EXAMPLE;

        input.focus();

        setBadge(
            "Example loaded",
            "muted"
        );
    }

    // =========================================================
    // CLEAR / RESET
    // =========================================================

    function clearAll() {
        if (input) {
            input.value = "";
        }

        if (list) {
            list.replaceChildren();
        }

        feature = null;

        if (analysisPanel) {
            analysisPanel.hidden = true;
        }

        updateCount();
        show("empty");

        setBadge(
            "Ready",
            "muted"
        );

        setSave("");
    }

    // =========================================================
    // BUTTON EVENTS
    // =========================================================

    if (analyzeBtn) {
        analyzeBtn.addEventListener(
            "click",
            analyzeRequirement
        );
    }

    if (genBtn) {
        genBtn.addEventListener(
            "click",
            generateTestSuite
        );
    }

    if (saveBtn) {
        saveBtn.addEventListener(
            "click",
            saveFeature
        );
    }

    // Example button support.
    const exampleBtn =
        $("example-btn");

    if (exampleBtn) {
        exampleBtn.addEventListener(
            "click",
            loadExample
        );
    }

    // Clear button support.
    const clearBtn =
        $("clear-btn");

    if (clearBtn) {
        clearBtn.addEventListener(
            "click",
            clearAll
        );
    }

    // =========================================================
    // KEYBOARD SHORTCUT
    // =========================================================

    if (input) {
        input.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.ctrlKey &&
                    event.key === "Enter"
                ) {
                    event.preventDefault();
                    generateTestSuite();
                }
            }
        );
    }

    // =========================================================
    // INITIAL STATE
    // =========================================================

    show("empty");

    setBadge(
        "Ready",
        "muted"
    );

    console.log(
        "SpecFlow AI frontend loaded successfully."
    );
});