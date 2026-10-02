document.addEventListener("DOMContentLoaded", () => {
    const API = "http://127.0.0.1:8000/api/v1";
    const EXAMPLE = "Users can log in with email and password. After 5 failed attempts, the account is locked for 15 minutes.";

    const $ = (id) => document.getElementById(id);
    const input = $("prd-input"), genBtn = $("generate-btn"), saveBtn = $("save-btn");
    const badge = $("status-badge"), list = $("review-list"), count = $("count");
    const views = { empty: $("empty"), loading: $("loading"), error: $("error"), review: list };

    let feature = null; // feature name + description from the last generation

    const STRIP = /^(given|when|then|and|but)\s+/i;
    const strip = (s) => s.trim().replace(STRIP, "");

    function setBadge(text, cls) { badge.textContent = text; badge.className = `pill ${cls}`; }
    function setSave(text, isError = false) { $("save-status").textContent = text; $("save-status").className = isError ? "error muted" : "muted"; }

    function show(name) {
        Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
        $("save-bar").hidden = name !== "review";
        if (name !== "review") { $("saved-details").hidden = true; count.textContent = ""; }
    }

    function updateCount() {
        const n = list.querySelectorAll(".card").length;
        count.textContent = `${n} ${n === 1 ? "scenario" : "scenarios"}`;
    }

    /* ---------- step rows ---------- */
    function relabel(group) {
        const kind = group.dataset.kind;
        group.querySelectorAll(".step").forEach((row, i) => {
            const chip = row.querySelector(".kw");
            chip.textContent = i === 0 ? kind[0].toUpperCase() + kind.slice(1) : "And";
        });
    }

    function stepRow(kind, text, removable) {
        const row = document.createElement("div");
        row.className = "step";
        row.innerHTML = `<span class="kw ${kind}"></span><input aria-label="${kind} step">` +
            (removable ? `<button type="button" class="x-btn" aria-label="Remove step">&times;</button>` : "");
        row.querySelector("input").value = text;
        if (removable) {
            row.querySelector(".x-btn").addEventListener("click", () => {
                const group = row.parentElement;
                row.remove();
                relabel(group);
            });
        }
        return row;
    }

    function group(kind, steps, multi) {
        const wrap = document.createElement("div");
        wrap.className = "group";
        const rows = document.createElement("div");
        rows.dataset.kind = kind;
        rows.className = "steps";
        steps.forEach((s) => rows.appendChild(stepRow(kind, strip(s), multi)));
        wrap.appendChild(rows);
        relabel(rows);
        if (multi) {
            const add = document.createElement("button");
            add.type = "button";
            add.className = "add-step";
            add.textContent = "Add step";
            add.addEventListener("click", () => {
                const row = stepRow(kind, "", true);
                rows.appendChild(row);
                relabel(rows);
                row.querySelector("input").focus();
            });
            wrap.appendChild(add);
        }
        return wrap;
    }

    function buildCard(sc) {
        const card = document.createElement("article");
        card.className = "card";
        card.innerHTML = `<div class="card-head"><input class="sc-title" aria-label="Scenario title">
            <button type="button" class="danger-btn">Delete scenario</button></div>`;
        card.querySelector(".sc-title").value = sc.scenario_title;
        card.querySelector(".danger-btn").addEventListener("click", () => {
            card.remove();
            updateCount();
            if (!list.querySelector(".card")) { setSave("No scenarios left to save.", true); }
        });
        card.appendChild(group("given", [sc.given_step], false));
        card.appendChild(group("when", sc.when_steps, true));
        card.appendChild(group("then", sc.then_steps, true));
        return card;
    }

    /* ---------- collect and validate ---------- */
    function collect() {
        const out = [];
        for (const card of list.querySelectorAll(".card")) {
            const title = card.querySelector(".sc-title").value.trim();
            const vals = (k) => [...card.querySelectorAll(`.steps[data-kind="${k}"] input`)].map((i) => i.value.trim()).filter(Boolean);
            const [given] = vals("given"), whens = vals("when"), thens = vals("then");
            if (!title || !given || !whens.length || !thens.length) {
                throw new Error(`"${title || "Untitled scenario"}" needs a title, a Given, and at least one When and Then.`);
            }
            out.push({
                scenario_title: title,
                given_step: `Given ${given}`,
                when_steps: whens.map((t, i) => `${i ? "And" : "When"} ${t}`),
                then_steps: thens.map((t, i) => `${i ? "And" : "Then"} ${t}`)
            });
        }
        return out;
    }

    /* ---------- events ---------- */
    input.addEventListener("input", () => { $("char-count").textContent = `${input.value.length} / 5000`; });
    $("example-btn").addEventListener("click", () => { input.value = EXAMPLE; input.dispatchEvent(new Event("input")); input.focus(); });

    genBtn.addEventListener("click", async () => {
        const text = input.value.trim();
        if (!text) { views.error.textContent = "Add a requirement first, or use the example."; show("error"); setBadge("Needs input", "error"); return; }

        genBtn.disabled = true;
        genBtn.textContent = "Generating...";
        setBadge("Generating", "working");
        show("loading");

        try {
            const res = await fetch(`${API}/generate-test-suite`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requirement_text: text })
            });
            const data = await res.json();
            if (!res.ok || data.status !== "success") throw new Error(data.detail || "The server returned an error.");

            const s = data.structured_json;
            feature = { feature_name: s.feature_name, feature_description: s.feature_description };
            list.replaceChildren(...s.scenarios.map(buildCard));
            show("review");
            updateCount();
            setSave("Review each scenario, then save.");
            setBadge("Ready to review", "ok");
        } catch (err) {
            const offline = err instanceof TypeError;
            views.error.textContent = offline
                ? "Cannot reach the server on port 8000. Start it with 'python server.py' and try again."
                : `Generation failed: ${err.message}`;
            show("error");
            setBadge(offline ? "Server offline" : "Failed", "error");
        } finally {
            genBtn.disabled = false;
            genBtn.textContent = "Generate scenarios";
        }
    });

    saveBtn.addEventListener("click", async () => {
        let scenarios;
        try { scenarios = collect(); } catch (err) { setSave(err.message, true); return; }
        if (!scenarios.length) { setSave("No scenarios left to save.", true); return; }

        saveBtn.disabled = true;
        try {
            const res = await fetch(`${API}/save-feature`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...feature, scenarios })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || res.statusText);
            setSave(`Saved to ${data.file_written_to}`);
            $("saved-gherkin").textContent = data.raw_gherkin;
            $("saved-details").hidden = false;
            setBadge("Saved", "ok");
        } catch (err) {
            setSave(`Save failed: ${err.message}`, true);
        } finally {
            saveBtn.disabled = false;
        }
    });
});