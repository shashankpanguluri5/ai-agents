"""The Premise agent workflow.

    planning ──▶ [CHECKPOINT 1: founder approves/edits the assumption plan]  (blocking)
             ──▶ researching ──▶ [CHECKPOINT 2: founder accepts/rejects each evidence card,
                                   can request more research]                (blocking)
             ──▶ reporting ──▶ [CHECKPOINT 3: founder approves the final report or sends feedback] (blocking)
             ──▶ completed

The agent cannot move past a checkpoint until the founder decides. Verdicts and confidence are
computed in code from the evidence the founder accepted, so they are explainable and reproducible;
the model only writes the narrative, labels, tests and critique.
"""

import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Callable, Optional

from . import prompts
from .db import Database, new_id, now_iso
from .llm import LLMError, LLMRouter
from .schemas import (
    EvidenceDecision, FinalDecision, LLMAnalysis, LLMChallengeAnswer, LLMCritique, LLMEvidence,
    LLMPlan, LLMTestPlan, PlanDecision,
)
from .search import PageFetcher, SearchError, SearchRouter, select_passages
from .security import clean_text, domain_of, verify_quote, wrap_untrusted

# Statuses
PLANNING = "planning"
AWAIT_PLAN = "awaiting_plan_approval"
RESEARCHING = "researching"
AWAIT_EVIDENCE = "awaiting_evidence_review"
REPORTING = "reporting"
AWAIT_FINAL = "awaiting_final_approval"
COMPLETED = "completed"
REJECTED = "rejected"
FAILED = "failed"


class StateError(Exception):
    """A decision was sent for a run that isn't waiting for it."""


def empty_state() -> dict:
    return {
        "objective": "",
        "assumptions": [],
        "evidence": [],
        "analysis": None,
        "test_plan": None,
        "critic_issues": [],
        "challenges": [],
        "checkpoints": [],
        "timings": [],
        "corrections": {
            "assumptions_edited": 0, "assumptions_added": 0, "assumptions_removed": 0,
            "evidence_rejected": 0, "report_revisions": 0, "more_research": 0,
        },
        "feedback_history": [],
        "providers_used": {},
        "plan_note": "",
    }


def compute_verdict(evidence: list[dict]) -> dict:
    """Verdict + confidence from founder-accepted evidence. Unverified quotes count half."""
    accepted = [e for e in evidence if e["decision"] == "accepted"]
    weight = lambda e: 1.0 if e["verified"] else 0.5
    s = sum(weight(e) for e in accepted if e["stance"] == "supports")
    c = sum(weight(e) for e in accepted if e["stance"] == "contradicts")
    domains = {e["domain"] for e in accepted if e["stance"] != "neutral"}
    if s + c == 0:
        verdict = "unproven"
    elif s > 0 and c > 0 and min(s, c) / max(s, c) >= 0.34:
        verdict = "mixed"
    else:
        verdict = "supported" if s > c else "contradicted"
    total = s + c
    if total >= 3 and len(domains) >= 2 and verdict in ("supported", "contradicted"):
        confidence = "high"
    elif total >= 2:
        confidence = "medium"
    else:
        confidence = "low"
    return {
        "verdict": verdict,
        "confidence": confidence,
        "counts": {
            "supports": sum(1 for e in accepted if e["stance"] == "supports"),
            "contradicts": sum(1 for e in accepted if e["stance"] == "contradicts"),
            "neutral": sum(1 for e in accepted if e["stance"] == "neutral"),
            "sources": len({e["domain"] for e in accepted}),
        },
    }


def _parse_ts(ts: str) -> float:
    return datetime.fromisoformat(ts).timestamp()


class Pipeline:
    def __init__(self, db: Database, llm_factory: Callable[[Callable], LLMRouter], search: SearchRouter,
                 fetcher: PageFetcher, max_assumptions: int = 6, sources_per_assumption: int = 4):
        self.db = db
        self.llm_factory = llm_factory
        self.search = search
        self.fetcher = fetcher
        self.max_assumptions = max_assumptions
        self.sources_per_assumption = sources_per_assumption

    # ---------- helpers ----------
    def _llm(self, run_id: str) -> LLMRouter:
        return self.llm_factory(lambda kind, msg: self.db.add_event(run_id, kind, msg))

    def _call(self, run_id: str, state: dict, system: str, user: str, model_cls):
        router = self._llm(run_id)
        result = router.json(system, user, model_cls)
        used = router.last_provider or "unknown"
        state["providers_used"][used] = state["providers_used"].get(used, 0) + 1
        return result

    def _load(self, run_id: str) -> tuple[dict, dict, dict]:
        run = self.db.get_run(run_id)
        if not run:
            raise KeyError(run_id)
        project = self.db.get_project(run["project_id"])
        return run, run["state"], project

    def _save(self, run_id: str, state: dict, status: Optional[str] = None) -> None:
        self.db.update_run(run_id, status=status, state=state)

    def _event(self, run_id: str, kind: str, msg: str) -> None:
        self.db.add_event(run_id, kind, msg)

    @contextmanager
    def _stage(self, run_id: str, state: dict, stage: str):
        start = now_iso()
        try:
            yield
        finally:
            state["timings"].append({"stage": stage, "start": start, "end": now_iso()})

    def _open_checkpoint(self, state: dict, name: str) -> None:
        state["checkpoints"].append({"name": name, "opened_at": now_iso(), "decided_at": None, "decision": None})

    def _close_checkpoint(self, state: dict, name: str, decision: str) -> None:
        for cp in reversed(state["checkpoints"]):
            if cp["name"] == name and cp["decided_at"] is None:
                cp["decided_at"] = now_iso()
                cp["decision"] = decision
                return

    def _require(self, run: dict, status: str) -> None:
        if run["status"] != status:
            raise StateError(f"Run is '{run['status']}', expected '{status}'.")

    def _fail(self, run_id: str, state: dict, err: Exception) -> None:
        self._event(run_id, "error", f"Stopped: {err}")
        self.db.update_run(run_id, status=FAILED, state=state, error=str(err)[:1000])

    @staticmethod
    def _project_brief(project: dict) -> str:
        parts = [f"Startup: {project['name']}", f"Stage: {project['stage']}"]
        if project["industry"]:
            parts.append(f"Industry: {project['industry']}")
        if project["target_customer"]:
            parts.append(f"Target customer (founder's words): {project['target_customer']}")
        parts.append(f"Pitch (founder's words):\n{project['pitch']}")
        return "\n".join(parts)

    # ---------- step 1: plan ----------
    def plan(self, run_id: str) -> None:
        run, state, project = self._load(run_id)
        try:
            with self._stage(run_id, state, "planning"):
                self._event(run_id, "step", "Reading the pitch and listing the beliefs it depends on")
                plan = self._call(run_id, state, prompts.PLANNER_SYSTEM, self._project_brief(project), LLMPlan)
                state["objective"] = clean_text(plan.objective, 600)
                items = []
                for a in plan.assumptions:
                    items.append({
                        "id": new_id("asm"),
                        "statement": clean_text(a.statement, 400),
                        "category": a.category,
                        "kind": a.kind,
                        "rationale": clean_text(a.rationale, 600),
                        "impact": a.impact,
                        "uncertainty": a.uncertainty,
                        "risk": a.impact * a.uncertainty,
                        "queries": [clean_text(q, 200) for q in a.queries if q.strip()][:3],
                        "origin": "agent",
                        "selected": False,
                    })
                items.sort(key=lambda x: x["risk"], reverse=True)
                for x in items[: self.max_assumptions]:
                    x["selected"] = True
                state["assumptions"] = items
            self._event(run_id, "step", f"Found {len(items)} assumptions; pre-selected the {min(len(items), self.max_assumptions)} riskiest")
            self._open_checkpoint(state, "plan")
            self._event(run_id, "checkpoint", "Waiting for you to review the research plan")
            self._save(run_id, state, AWAIT_PLAN)
        except (LLMError, Exception) as e:  # noqa: BLE001 - any failure must surface to the founder
            self._fail(run_id, state, e)

    def apply_plan_decision(self, run_id: str, decision: PlanDecision) -> str:
        run, state, _ = self._load(run_id)
        self._require(run, AWAIT_PLAN)
        state["plan_note"] = clean_text(decision.note, 1000)
        if not decision.approve:
            self._close_checkpoint(state, "plan", "rejected")
            self._event(run_id, "decision", "You stopped the run at the plan review")
            self._save(run_id, state, REJECTED)
            return REJECTED

        if decision.assumptions:
            old = {a["id"]: a for a in state["assumptions"]}
            new_list, seen = [], set()
            for edit in decision.assumptions:
                statement = clean_text(edit.statement, 400)
                queries = [clean_text(q, 200) for q in edit.queries if q.strip()][:4]
                if edit.id and edit.id in old:
                    prev = old[edit.id]
                    seen.add(edit.id)
                    changed = (prev["statement"] != statement or prev["impact"] != edit.impact
                               or prev["uncertainty"] != edit.uncertainty or prev["queries"] != queries)
                    if changed:
                        state["corrections"]["assumptions_edited"] += 1
                    prev.update(statement=statement, category=edit.category, kind=edit.kind, impact=edit.impact,
                                uncertainty=edit.uncertainty, risk=edit.impact * edit.uncertainty,
                                queries=queries or prev["queries"], selected=edit.selected)
                    new_list.append(prev)
                else:
                    state["corrections"]["assumptions_added"] += 1
                    new_list.append({
                        "id": new_id("asm"), "statement": statement, "category": edit.category, "kind": edit.kind,
                        "rationale": "Added by the founder.", "impact": edit.impact, "uncertainty": edit.uncertainty,
                        "risk": edit.impact * edit.uncertainty, "queries": queries or [statement[:120]],
                        "origin": "founder", "selected": edit.selected,
                    })
            state["corrections"]["assumptions_removed"] += len(set(old) - seen)
            state["assumptions"] = new_list

        selected = [a for a in state["assumptions"] if a["selected"]]
        if not selected:
            raise StateError("Select at least one assumption to research.")
        self._close_checkpoint(state, "plan", "approved")
        self._event(run_id, "decision", f"You approved research on {len(selected)} assumptions")
        self._save(run_id, state, RESEARCHING)
        return RESEARCHING

    # ---------- step 2: research ----------
    def research(self, run_id: str, assumption_ids: Optional[list[str]] = None, extra_queries: Optional[dict] = None) -> None:
        run, state, _ = self._load(run_id)
        try:
            with self._stage(run_id, state, "researching"):
                targets = [a for a in state["assumptions"] if a["selected"] and (assumption_ids is None or a["id"] in assumption_ids)]
                for a in targets:
                    queries = (extra_queries or {}).get(a["id"]) or a["queries"][:2]
                    self._research_one(run_id, state, a, queries)
                    self._save(run_id, state)  # let the UI show cards as they arrive
            verified = sum(1 for e in state["evidence"] if e["verified"])
            self._event(run_id, "step", f"Collected {len(state['evidence'])} evidence cards ({verified} with quotes verified against the source)")
            self._open_checkpoint(state, "evidence")
            self._event(run_id, "checkpoint", "Waiting for you to accept or reject the evidence")
            self._save(run_id, state, AWAIT_EVIDENCE)
        except Exception as e:  # noqa: BLE001
            self._fail(run_id, state, e)

    def _research_one(self, run_id: str, state: dict, a: dict, queries: list[str]) -> None:
        self._event(run_id, "step", f"Researching: {a['statement'][:90]}")
        known_urls = {e["url"] for e in state["evidence"] if e["assumption_id"] == a["id"]}
        results = []
        for q in queries:
            try:
                for r in self.search.search(q, max_results=self.sources_per_assumption):
                    if r.url not in known_urls and r.url not in {x[1].url for x in results}:
                        results.append((q, r))
            except SearchError as e:
                self._event(run_id, "warning", f"Search failed for '{q[:60]}': {str(e)[:120]}")
        if not results:
            self._event(run_id, "warning", "No sources found for this assumption")
            return

        found = 0
        for q, r in results[: self.sources_per_assumption + 1]:
            if found >= self.sources_per_assumption:
                break
            page = self.fetcher.fetch(r.url)
            snippet_only = not page
            text = page or r.snippet
            if not text or len(text) < 80:
                continue
            self._event(run_id, "tool", f"Reading {domain_of(r.url)}")
            user = (
                f"Assumption: {a['statement']}\n\nSource title: {r.title[:200]}\nSource URL: {r.url}\n\n"
                + wrap_untrusted(select_passages(text, f"{a['statement']} {q}"), r.url)
            )
            try:
                ev = self._call(run_id, state, prompts.EVIDENCE_SYSTEM, user, LLMEvidence)
            except LLMError as e:
                self._event(run_id, "warning", f"Could not analyse {domain_of(r.url)}: {str(e)[:120]}")
                continue
            if not ev.relevant or not ev.quote.strip():
                continue
            verified = verify_quote(ev.quote, text)
            state["evidence"].append({
                "id": new_id("ev"),
                "assumption_id": a["id"],
                "url": r.url,
                "title": clean_text(r.title, 200),
                "domain": domain_of(r.url),
                "query": q,
                "quote": clean_text(ev.quote, 600),
                "stance": ev.stance,
                "summary": clean_text(ev.summary, 400),
                "verified": verified,
                "snippet_only": snippet_only,
                "decision": "pending",
                "note": "",
            })
            found += 1
            if not verified:
                self._event(run_id, "warning", f"Quote from {domain_of(r.url)} not found verbatim in the page; flagged for your review")

    def apply_evidence_decision(self, run_id: str, decision: EvidenceDecision) -> tuple[str, dict]:
        run, state, _ = self._load(run_id)
        self._require(run, AWAIT_EVIDENCE)
        by_id = {e["id"]: e for e in state["evidence"]}
        for d in decision.decisions:
            ev = by_id.get(d.evidence_id)
            if not ev:
                continue
            if d.decision == "rejected" and ev["decision"] != "rejected":
                state["corrections"]["evidence_rejected"] += 1
            ev["decision"] = d.decision
            ev["note"] = clean_text(d.note, 500)

        valid_ids = {a["id"] for a in state["assumptions"]}
        more = {m.assumption_id: [clean_text(m.query, 200)] for m in decision.more_research if m.assumption_id in valid_ids}
        if more:
            state["corrections"]["more_research"] += len(more)
            self._close_checkpoint(state, "evidence", "more_research")
            self._event(run_id, "decision", f"You asked for more research on {len(more)} assumption(s)")
            self._save(run_id, state, RESEARCHING)
            return RESEARCHING, more

        pending = [e for e in state["evidence"] if e["decision"] == "pending"]
        if pending:
            raise StateError(f"{len(pending)} evidence card(s) still need a decision.")
        self._close_checkpoint(state, "evidence", "approved")
        accepted = sum(1 for e in state["evidence"] if e["decision"] == "accepted")
        self._event(run_id, "decision", f"You accepted {accepted} of {len(state['evidence'])} evidence cards")
        self._save(run_id, state, REPORTING)
        return REPORTING, {}

    # ---------- step 3: report ----------
    def report(self, run_id: str, feedback: str = "") -> None:
        run, state, project = self._load(run_id)
        try:
            with self._stage(run_id, state, "reporting"):
                selected = [a for a in state["assumptions"] if a["selected"]]
                verdicts = {a["id"]: compute_verdict([e for e in state["evidence"] if e["assumption_id"] == a["id"]]) for a in selected}
                accepted = {e["id"]: e for e in state["evidence"] if e["decision"] == "accepted"}

                self._event(run_id, "step", "Weighing the accepted evidence for each assumption")
                blocks = []
                for a in selected:
                    evs = [e for e in accepted.values() if e["assumption_id"] == a["id"]]
                    ev_text = "\n".join(
                        f'  - [{e["id"]}] ({e["stance"]}, {e["domain"]}, {"verified" if e["verified"] else "UNVERIFIED quote"}) "{e["quote"]}"'
                        for e in evs
                    ) or "  - (no accepted evidence)"
                    v = verdicts[a["id"]]
                    blocks.append(f'[{a["id"]}] {a["statement"]}\n  computed verdict: {v["verdict"]}, confidence: {v["confidence"]}\n{ev_text}')
                user = self._project_brief(project) + "\n\nAssumptions and accepted evidence:\n" + "\n\n".join(blocks)
                if feedback:
                    user += f"\n\nThe founder reviewed the previous draft and gave this feedback; address it:\n{feedback}"
                analysis = self._call(run_id, state, prompts.ANALYST_SYSTEM, user, LLMAnalysis)

                by_asm = {x.assumption_id: x for x in analysis.assessments}
                assessments = []
                for a in selected:
                    llm_a = by_asm.get(a["id"])
                    statements = []
                    for s in (llm_a.statements if llm_a else []):
                        ids = [i for i in s.evidence_ids if i in accepted]
                        label = s.label
                        if label == "fact" and not ids:
                            label = "assumption"  # a "fact" with no accepted source is not a fact
                        statements.append({"text": clean_text(s.text, 500), "label": label, "evidence_ids": ids})
                    assessments.append({
                        "assumption_id": a["id"],
                        **verdicts[a["id"]],
                        "reasoning": clean_text(llm_a.reasoning, 1200) if llm_a else "No assessment returned for this assumption.",
                        "statements": statements,
                    })
                contradictions = [
                    {"description": clean_text(c.description, 600),
                     "assumption_ids": [i for i in c.assumption_ids if i in verdicts],
                     "evidence_ids": [i for i in c.evidence_ids if i in accepted]}
                    for c in analysis.contradictions
                ]
                state["analysis"] = {"summary": clean_text(analysis.summary, 1500), "assessments": assessments, "contradictions": contradictions}

                self._event(run_id, "step", "Designing tests for the assumptions that remain risky")
                risky = sorted(
                    [a for a in selected if not (verdicts[a["id"]]["verdict"] == "supported" and verdicts[a["id"]]["confidence"] == "high")],
                    key=lambda a: a["risk"], reverse=True,
                )[:5] or selected[:3]
                tp_user = self._project_brief(project) + "\n\nAssumptions to test:\n" + "\n".join(
                    f'[{a["id"]}] {a["statement"]} (current verdict: {verdicts[a["id"]]["verdict"]}, confidence {verdicts[a["id"]]["confidence"]})'
                    for a in risky
                )
                if feedback:
                    tp_user += f"\n\nFounder feedback on the previous draft:\n{feedback}"
                tp = self._call(run_id, state, prompts.STRATEGIST_SYSTEM, tp_user, LLMTestPlan)
                valid = {a["id"] for a in selected}
                state["test_plan"] = {
                    "tests": [t.model_dump() for t in tp.tests if t.assumption_id in valid],
                    "interview_questions": [clean_text(q, 300) for q in tp.interview_questions][:12],
                    "limitations": [clean_text(x, 300) for x in tp.limitations][:8],
                }

                self._event(run_id, "step", "Critic reviewing the draft for overclaiming")
                draft = "\n".join(
                    f'- {a["assumption_id"]}: verdict {a["verdict"]} ({a["confidence"]}). '
                    + " ".join(f'[{s["label"]}] {s["text"]} (sources: {", ".join(s["evidence_ids"]) or "none"})' for s in a["statements"])
                    for a in assessments
                ) + f"\nSummary: {state['analysis']['summary']}\n\nEvidence quotes:\n" + "\n".join(
                    f'[{e["id"]}] {e["domain"]}: "{e["quote"]}"' for e in accepted.values()
                )
                try:
                    crit = self._call(run_id, state, prompts.CRITIC_SYSTEM, draft, LLMCritique)
                    # Small fallback models sometimes echo the draft back; drop lines that are copies of it.
                    state["critic_issues"] = [
                        clean_text(i, 400) for i in crit.issues
                        if i.strip() and i.strip()[:60] not in draft and "(sources:" not in i and not i.strip().startswith("asm_")
                    ][:6]
                except LLMError as e:
                    state["critic_issues"] = [f"Critic step could not run: {str(e)[:150]}"]

            self._open_checkpoint(state, "final")
            self._event(run_id, "checkpoint", "Report ready; waiting for your final approval")
            self._save(run_id, state, AWAIT_FINAL)
        except Exception as e:  # noqa: BLE001
            self._fail(run_id, state, e)

    def apply_final_decision(self, run_id: str, decision: FinalDecision) -> str:
        run, state, _ = self._load(run_id)
        self._require(run, AWAIT_FINAL)
        if decision.approve:
            self._close_checkpoint(state, "final", "approved")
            self._event(run_id, "decision", "You approved the final report")
            self._save(run_id, state, COMPLETED)
            return COMPLETED
        feedback = clean_text(decision.feedback, 2000)
        if not feedback:
            raise StateError("Add feedback so the agent knows what to change, or approve the report.")
        state["corrections"]["report_revisions"] += 1
        state["feedback_history"].append({"ts": now_iso(), "feedback": feedback})
        self._close_checkpoint(state, "final", "revise")
        self._event(run_id, "decision", "You sent the report back with feedback")
        self._save(run_id, state, REPORTING)
        return REPORTING

    # ---------- challenge a conclusion ----------
    def challenge(self, run_id: str, assumption_id: str, question: str) -> dict:
        run, state, _ = self._load(run_id)
        if run["status"] not in (AWAIT_EVIDENCE, AWAIT_FINAL, COMPLETED):
            raise StateError("You can challenge conclusions once evidence has been collected.")
        a = next((x for x in state["assumptions"] if x["id"] == assumption_id), None)
        if not a:
            raise StateError("Unknown assumption.")
        evs = [e for e in state["evidence"] if e["assumption_id"] == assumption_id and e["decision"] != "rejected"]
        user = f"Assumption: {a['statement']}\n\nFounder's challenge: {clean_text(question, 1000)}\n\nEvidence:\n" + (
            "\n".join(f'[{e["id"]}] ({e["stance"]}, {e["domain"]}) ' + wrap_untrusted(e["quote"], e["url"], 800) for e in evs)
            or "(no evidence)"
        )
        ans = self._call(run_id, state, prompts.CHALLENGE_SYSTEM, user, LLMChallengeAnswer)
        ids = [i for i in ans.evidence_ids if i in {e["id"] for e in evs}]
        label = "assumption" if ans.label == "fact" and not ids else ans.label
        item = {
            "id": new_id("chl"), "assumption_id": assumption_id, "question": clean_text(question, 1000),
            "answer": clean_text(ans.answer, 2000), "label": label, "evidence_ids": ids,
            "suggested_query": clean_text(ans.suggested_query, 200), "ts": now_iso(),
        }
        # re-read: background work may have saved state meanwhile
        _, fresh, _ = self._load(run_id)
        fresh["challenges"].append(item)
        fresh["providers_used"] = state["providers_used"]
        self._save(run_id, fresh)
        self._event(run_id, "decision", f"You challenged a conclusion: {item['question'][:80]}")
        return item


def run_metrics(run: dict) -> dict:
    """Measured time-savings numbers for one run. Nothing here is estimated except the founder's baseline."""
    state = run["state"]
    agent_s = sum(_parse_ts(t["end"]) - _parse_ts(t["start"]) for t in state["timings"])
    human_s = sum(_parse_ts(c["decided_at"]) - _parse_ts(c["opened_at"]) for c in state["checkpoints"] if c["decided_at"])
    assisted_min = (agent_s + human_s) / 60
    manual = run.get("manual_baseline_minutes")
    saved_pct = round((manual - assisted_min) / manual * 100, 1) if manual else None
    ev = state["evidence"]
    corrections = state["corrections"]
    accepted = sum(1 for e in ev if e["decision"] == "accepted")
    return {
        # A run with no accepted evidence produced no research, so it must not count as time saved.
        "counts_toward_savings": run["status"] == "completed" and accepted > 0,
        "agent_minutes": round(agent_s / 60, 2),
        "human_review_minutes": round(human_s / 60, 2),
        "assisted_minutes": round(assisted_min, 2),
        "manual_baseline_minutes": manual,
        "baseline_source": "founder estimate" if manual else None,
        "time_saved_minutes": round(manual - assisted_min, 1) if manual else None,
        "time_saved_pct": saved_pct,
        "human_corrections": sum(corrections.values()),
        "corrections": corrections,
        "evidence_total": len(ev),
        "evidence_verified": sum(1 for e in ev if e["verified"]),
        "evidence_accepted": accepted,
        "evidence_rejected": sum(1 for e in ev if e["decision"] == "rejected"),
        "providers_used": state["providers_used"],
    }
