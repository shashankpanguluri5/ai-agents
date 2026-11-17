"""Markdown export of a finished (or in-review) run."""

from .pipeline import run_metrics

VERDICT_ICON = {"supported": "🟢", "contradicted": "🔴", "mixed": "🟡", "unproven": "⚪"}


def to_markdown(project: dict, run: dict) -> str:
    s = run["state"]
    m = run_metrics(run)
    asm = {a["id"]: a for a in s["assumptions"]}
    ev = {e["id"]: e for e in s["evidence"]}
    status = "Approved by founder" if run["status"] == "completed" else f"DRAFT ({run['status']})"
    out = [
        f"# Premise assumption report: {project['name']}",
        f"_{status} · generated {run['updated_at'][:10]}_",
        "",
        "> Labels: **fact** = stated by a source the founder accepted · **assumption** = not proven · "
        "**prediction** = about the future · **recommendation** = suggested action. "
        "Decisions about the business remain the founder's.",
        "",
    ]
    a = s.get("analysis") or {}
    if a.get("summary"):
        out += ["## Summary", a["summary"], ""]

    out += ["## Assumptions", "", "| Risk | Assumption | Verdict | Confidence | Evidence (for/against) |", "|---:|---|---|---|---|"]
    for x in a.get("assessments", []):
        item = asm.get(x["assumption_id"], {})
        c = x["counts"]
        out.append(
            f"| {item.get('risk', '')} | {item.get('statement', '')} | {VERDICT_ICON[x['verdict']]} {x['verdict']} | "
            f"{x['confidence']} | {c['supports']} / {c['contradicts']} |"
        )
    out.append("")

    for x in a.get("assessments", []):
        item = asm.get(x["assumption_id"], {})
        out += [f"### {item.get('statement', '')}", x["reasoning"], ""]
        for st in x["statements"]:
            refs = " ".join(f"[{i}]" for i in st["evidence_ids"])
            out.append(f"- **{st['label']}**: {st['text']} {refs}".rstrip())
        accepted = [e for e in s["evidence"] if e["assumption_id"] == x["assumption_id"] and e["decision"] == "accepted"]
        if accepted:
            out += ["", "Sources:"]
            for e in accepted:
                flag = "" if e["verified"] else " _(quote not verified verbatim)_"
                out.append(f'- [{e["id"]}] {e["stance"]}: "{e["quote"]}" ({e["url"]}){flag}')
        out.append("")

    if a.get("contradictions"):
        out += ["## Contradictions found", ""]
        out += [f"- {c['description']}" for c in a["contradictions"]]
        out.append("")

    tp = s.get("test_plan") or {}
    if tp.get("tests"):
        out += ["## Test plan", "", "| Assumption | Experiment | Metric | Success threshold | Effort | Timeframe |", "|---|---|---|---|---|---|"]
        for t in tp["tests"]:
            out.append(
                f"| {asm.get(t['assumption_id'], {}).get('statement', '')} | {t['experiment']} | {t['metric']} | "
                f"{t['success_threshold']} | {t['effort']} | {t['timeframe']} |"
            )
        out.append("")
    if tp.get("interview_questions"):
        out += ["## Customer interview script", ""] + [f"{i}. {q}" for i, q in enumerate(tp["interview_questions"], 1)] + [""]
    if s.get("challenges"):
        out += ["## Founder challenges", ""]
        for ch in s["challenges"]:
            out += [f"- **Q:** {ch['question']}", f"  **A ({ch['label']}):** {ch['answer']}"]
        out.append("")
    if s.get("critic_issues"):
        out += ["## Critic's notes", ""] + [f"- {i}" for i in s["critic_issues"]] + [""]
    if tp.get("limitations"):
        out += ["## Limitations", ""] + [f"- {i}" for i in tp["limitations"]] + [""]

    out += [
        "## Time & oversight (measured)",
        "",
        f"- Agent working time: {m['agent_minutes']} min",
        f"- Founder review time: {m['human_review_minutes']} min",
        f"- Human corrections: {m['human_corrections']}",
        f"- Evidence: {m['evidence_total']} found, {m['evidence_verified']} quotes verified, {m['evidence_accepted']} accepted",
    ]
    if not m["evidence_accepted"]:
        out.append("- No evidence was accepted in this run, so it is not counted as time saved.")
    elif m["manual_baseline_minutes"]:
        out.append(
            f"- Manual baseline (founder estimate): {m['manual_baseline_minutes']} min → time saved {m['time_saved_pct']}%"
        )
    out.append(f"- Models used: {', '.join(f'{k} ×{v}' for k, v in m['providers_used'].items()) or 'none'}")
    return "\n".join(out) + "\n"
