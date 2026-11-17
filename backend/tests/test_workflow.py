"""End-to-end workflow through the API, with all three human checkpoints."""

from conftest import PITCH


def start(client, baseline=None):
    p = client.post("/api/projects", json=PITCH).json()
    body = {"manual_baseline_minutes": baseline} if baseline else {}
    run = client.post(f"/api/projects/{p['id']}/runs", json=body).json()
    return p, client.get(f"/api/runs/{run['id']}").json()


def approve_plan(client, run):
    return client.post(f"/api/runs/{run['id']}/plan-decision", json={"approve": True})


def test_plan_checkpoint_blocks_until_decision(client):
    _, run = start(client)
    assert run["status"] == "awaiting_plan_approval"
    asms = run["state"]["assumptions"]
    assert len(asms) == 3
    assert [a["risk"] for a in asms] == sorted([a["risk"] for a in asms], reverse=True)
    assert sum(a["selected"] for a in asms) == 2  # max_assumptions=2
    assert asms[0]["category"] == "business_model"  # "business model" normalized
    # No evidence decision possible before the plan is approved
    r = client.post(f"/api/runs/{run['id']}/evidence-decision", json={"decisions": []})
    assert r.status_code == 409
    assert run["state"]["evidence"] == []


def test_rejecting_plan_stops_run(client):
    _, run = start(client)
    r = client.post(f"/api/runs/{run['id']}/plan-decision", json={"approve": False, "note": "Wrong focus"})
    assert r.json()["status"] == "rejected"
    assert client.get(f"/api/runs/{run['id']}").json()["state"]["evidence"] == []


def test_founder_edits_are_counted(client):
    _, run = start(client)
    a0, a1, _a2 = run["state"]["assumptions"]
    edits = [
        {**{k: a0[k] for k in ("id", "category", "kind", "impact", "uncertainty", "queries")}, "statement": a0["statement"] + " in France", "selected": True},
        {**{k: a1[k] for k in ("id", "statement", "category", "kind", "impact", "uncertainty", "queries")}, "selected": False},
        {"statement": "Bakers trust phone apps with stock data", "category": "customer", "impact": 4, "uncertainty": 4, "queries": [], "selected": True},
    ]
    r = client.post(f"/api/runs/{run['id']}/plan-decision", json={"approve": True, "assumptions": edits})
    assert r.status_code == 200
    run = client.get(f"/api/runs/{run['id']}").json()
    c = run["state"]["corrections"]
    assert (c["assumptions_edited"], c["assumptions_added"], c["assumptions_removed"]) == (1, 1, 1)
    founder = [a for a in run["state"]["assumptions"] if a["origin"] == "founder"][0]
    assert founder["queries"]  # falls back to the statement as a query


def test_full_run_with_verification_labels_and_feedback(client):
    _, run = start(client, baseline=180)
    rid = run["id"]
    approve_plan(client, run)
    run = client.get(f"/api/runs/{rid}").json()
    assert run["status"] == "awaiting_evidence_review"

    ev = run["state"]["evidence"]
    assert ev, "evidence should be collected"
    supports = [e for e in ev if e["stance"] == "supports"]
    invented = [e for e in ev if e["stance"] == "contradicts"]
    assert supports and all(e["verified"] for e in supports)
    assert invented and not any(e["verified"] for e in invented), "an invented quote must not pass verification"

    # Can't finish while cards are pending
    r = client.post(f"/api/runs/{rid}/evidence-decision", json={"decisions": []})
    assert r.status_code == 409

    decisions = [{"evidence_id": e["id"], "decision": "accepted" if e["verified"] else "rejected"} for e in ev]
    r = client.post(f"/api/runs/{rid}/evidence-decision", json={"decisions": decisions})
    assert r.json()["status"] == "reporting"
    run = client.get(f"/api/runs/{rid}").json()
    assert run["status"] == "awaiting_final_approval"

    a = run["state"]["analysis"]
    first = a["assessments"][0]
    assert first["verdict"] in ("supported", "unproven", "contradicted", "mixed")
    labels = [(s["text"], s["label"]) for s in first["statements"]]
    assert ("Everyone hates inventory.", "assumption") in labels, "unsourced 'fact' must be downgraded"
    assert run["state"]["test_plan"]["tests"]
    assert run["state"]["critic_issues"]

    # Final checkpoint: rejecting needs feedback, then the report is regenerated
    assert client.post(f"/api/runs/{rid}/final-decision", json={"approve": False}).status_code == 409
    r = client.post(f"/api/runs/{rid}/final-decision", json={"approve": False, "feedback": "Focus on pricing."})
    assert r.json()["status"] == "reporting"
    run = client.get(f"/api/runs/{rid}").json()
    assert run["status"] == "awaiting_final_approval"
    assert run["state"]["corrections"]["report_revisions"] == 1

    # Challenge a conclusion; unsourced "fact" answer is downgraded
    asm_id = first["assumption_id"]
    ch = client.post(f"/api/runs/{rid}/challenge", json={"assumption_id": asm_id, "question": "Does this hold for rural bakeries?"}).json()
    assert ch["label"] == "assumption" and ch["suggested_query"]

    assert client.post(f"/api/runs/{rid}/final-decision", json={"approve": True}).json()["status"] == "completed"
    md = client.get(f"/api/runs/{rid}/report.md").text
    assert "CrumbCount" in md and "Test plan" in md and "founder estimate" in md

    m = client.get(f"/api/runs/{rid}").json()["metrics"]
    assert m["manual_baseline_minutes"] == 180
    assert m["time_saved_pct"] is not None and m["time_saved_pct"] > 90  # fake run takes seconds
    assert m["human_corrections"] >= 2
    summary = client.get("/api/metrics").json()["summary"]
    assert summary["completed_runs"] == 1 and summary["runs_with_baseline"] == 1


def test_more_research_loops_back_to_review(client):
    _, run = start(client)
    rid = run["id"]
    approve_plan(client, run)
    run = client.get(f"/api/runs/{rid}").json()
    before = len(run["state"]["evidence"])
    asm_id = run["state"]["assumptions"][0]["id"]
    r = client.post(f"/api/runs/{rid}/evidence-decision",
                    json={"decisions": [], "more_research": [{"assumption_id": asm_id, "query": "bakery stock counting survey"}]})
    assert r.json()["status"] == "researching"
    run = client.get(f"/api/runs/{rid}").json()
    assert run["status"] == "awaiting_evidence_review"
    assert len(run["state"]["evidence"]) > before
    assert run["state"]["corrections"]["more_research"] == 1


def test_report_not_available_early(client):
    _, run = start(client)
    assert client.get(f"/api/runs/{run['id']}/report.md").status_code == 409


def test_input_validation(client):
    assert client.post("/api/projects", json={**PITCH, "pitch": "too short"}).status_code == 422
    assert client.get("/api/runs/run_missing").status_code == 404


def test_health(client):
    h = client.get("/api/health").json()
    assert h["ok"] is True and h["search_providers"] == ["fake-search"]


def test_run_without_accepted_evidence_does_not_count_as_saved(client):
    _, run = start(client, baseline=120)
    rid = run["id"]
    approve_plan(client, run)
    run = client.get(f"/api/runs/{rid}").json()
    decisions = [{"evidence_id": e["id"], "decision": "rejected"} for e in run["state"]["evidence"]]
    client.post(f"/api/runs/{rid}/evidence-decision", json={"decisions": decisions})
    client.post(f"/api/runs/{rid}/final-decision", json={"approve": True})
    m = client.get(f"/api/runs/{rid}").json()["metrics"]
    assert m["counts_toward_savings"] is False
    assert client.get("/api/metrics").json()["summary"]["runs_with_baseline"] == 0
    assert "not counted as time saved" in client.get(f"/api/runs/{rid}/report.md").text
