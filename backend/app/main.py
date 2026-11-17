"""FastAPI app. Run from the backend folder: uvicorn app.main:create_app --factory --reload --port 8000"""

import threading
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .config import Settings, get_settings
from .db import Database
from .llm import LLMError, build_router
from .pipeline import (
    AWAIT_EVIDENCE, AWAIT_FINAL, AWAIT_PLAN, COMPLETED, REPORTING, RESEARCHING, Pipeline, StateError,
    empty_state, run_metrics,
)
from .report import to_markdown
from .schemas import (
    BaselineUpdate, ChallengeRequest, EvidenceDecision, FinalDecision, PlanDecision, ProjectCreate, RunCreate,
)
from .search import PageFetcher, build_search
from .security import clean_text


def _background(fn, *args, **kwargs) -> None:
    threading.Thread(target=fn, args=args, kwargs=kwargs, daemon=True).start()


def create_app(settings: Optional[Settings] = None, db: Optional[Database] = None,
               pipeline: Optional[Pipeline] = None, run_inline: bool = False) -> FastAPI:
    settings = settings or get_settings()
    db = db or Database(settings.database_path)
    pipeline = pipeline or Pipeline(
        db=db,
        llm_factory=lambda on_event: build_router(settings, on_event),
        search=build_search(settings.tavily_api_key),
        fetcher=PageFetcher(),
        max_assumptions=settings.max_assumptions_to_research,
        sources_per_assumption=settings.sources_per_assumption,
    )
    spawn = (lambda fn, *a, **k: fn(*a, **k)) if run_inline else _background

    app = FastAPI(title="Premise API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"],
    )
    app.state.db, app.state.pipeline = db, pipeline

    def get_run_or_404(run_id: str) -> dict:
        run = db.get_run(run_id)
        if not run:
            raise HTTPException(404, "Run not found")
        return run

    def conflict(e: Exception):
        raise HTTPException(409, str(e))

    @app.get("/api/health")
    def health():
        router = pipeline.llm_factory(lambda *_: None)
        providers = router.status()
        return {
            "ok": any(p["available"] for p in providers),
            "llm_providers": providers,
            "search_providers": pipeline.search.names,
        }

    # ----- projects -----
    @app.post("/api/projects", status_code=201)
    def create_project(body: ProjectCreate):
        return db.create_project(
            clean_text(body.name, 120), clean_text(body.pitch, 8000), clean_text(body.target_customer, 500),
            clean_text(body.stage, 60), clean_text(body.industry, 120),
        )

    @app.get("/api/projects")
    def list_projects():
        return db.list_projects()

    @app.get("/api/projects/{project_id}")
    def get_project(project_id: str):
        project = db.get_project(project_id)
        if not project:
            raise HTTPException(404, "Project not found")
        runs = [
            {"id": r["id"], "status": r["status"], "created_at": r["created_at"], "updated_at": r["updated_at"],
             "metrics": run_metrics(r)}
            for r in db.list_runs(project_id)
        ]
        return {**project, "runs": runs}

    @app.delete("/api/projects/{project_id}", status_code=204)
    def delete_project(project_id: str):
        db.delete_project(project_id)

    # ----- runs -----
    @app.post("/api/projects/{project_id}/runs", status_code=201)
    def start_run(project_id: str, body: RunCreate):
        if not db.get_project(project_id):
            raise HTTPException(404, "Project not found")
        run = db.create_run(project_id, empty_state(), body.manual_baseline_minutes)
        db.add_event(run["id"], "step", "Run started")
        spawn(pipeline.plan, run["id"])
        return db.get_run(run["id"])

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str, after_event: int = 0):
        run = get_run_or_404(run_id)
        return {**run, "project": db.get_project(run["project_id"]), "events": db.list_events(run_id, after_event),
                "metrics": run_metrics(run)}

    @app.post("/api/runs/{run_id}/plan-decision")
    def plan_decision(run_id: str, body: PlanDecision):
        get_run_or_404(run_id)
        try:
            status = pipeline.apply_plan_decision(run_id, body)
        except StateError as e:
            conflict(e)
        if status == RESEARCHING:
            spawn(pipeline.research, run_id)
        return {"status": status}

    @app.post("/api/runs/{run_id}/evidence-decision")
    def evidence_decision(run_id: str, body: EvidenceDecision):
        get_run_or_404(run_id)
        try:
            status, more = pipeline.apply_evidence_decision(run_id, body)
        except StateError as e:
            conflict(e)
        if status == RESEARCHING:
            spawn(pipeline.research, run_id, list(more.keys()), more)
        elif status == REPORTING:
            spawn(pipeline.report, run_id)
        return {"status": status}

    @app.post("/api/runs/{run_id}/final-decision")
    def final_decision(run_id: str, body: FinalDecision):
        get_run_or_404(run_id)
        try:
            status = pipeline.apply_final_decision(run_id, body)
        except StateError as e:
            conflict(e)
        if status == REPORTING:
            spawn(pipeline.report, run_id, clean_text(body.feedback, 2000))
        return {"status": status}

    @app.post("/api/runs/{run_id}/challenge")
    def challenge(run_id: str, body: ChallengeRequest):
        get_run_or_404(run_id)
        try:
            return pipeline.challenge(run_id, body.assumption_id, body.question)
        except StateError as e:
            conflict(e)
        except LLMError as e:
            raise HTTPException(503, str(e))

    @app.post("/api/runs/{run_id}/baseline")
    def set_baseline(run_id: str, body: BaselineUpdate):
        get_run_or_404(run_id)
        db.update_run(run_id, manual_baseline_minutes=body.manual_baseline_minutes)
        return run_metrics(db.get_run(run_id))

    @app.get("/api/runs/{run_id}/report.md", response_class=PlainTextResponse)
    def export_report(run_id: str):
        run = get_run_or_404(run_id)
        if run["status"] not in (AWAIT_FINAL, COMPLETED):
            raise HTTPException(409, "The report isn't ready yet.")
        return PlainTextResponse(
            to_markdown(db.get_project(run["project_id"]), run),
            headers={"Content-Disposition": f'attachment; filename="premise-report-{run_id}.md"'},
        )

    # ----- analytics -----
    @app.get("/api/metrics")
    def metrics():
        runs = db.list_runs()
        rows = []
        for r in runs:
            m = run_metrics(r)
            project = db.get_project(r["project_id"]) or {}
            rows.append({"run_id": r["id"], "project": project.get("name", ""), "status": r["status"],
                         "created_at": r["created_at"], **m})
        done = [x for x in rows if x["status"] == COMPLETED]
        with_baseline = [x for x in done if x["time_saved_pct"] is not None and x["counts_toward_savings"]]
        avg = lambda xs: round(sum(xs) / len(xs), 1) if xs else None
        return {
            "runs": rows,
            "summary": {
                "completed_runs": len(done),
                "runs_with_baseline": len(with_baseline),
                "avg_time_saved_pct": avg([x["time_saved_pct"] for x in with_baseline]),
                "total_time_saved_minutes": round(sum(x["time_saved_minutes"] for x in with_baseline), 1) if with_baseline else None,
                "avg_assisted_minutes": avg([x["assisted_minutes"] for x in done]),
                "avg_corrections": avg([x["human_corrections"] for x in done]),
                "evidence_verified_rate": (
                    round(sum(x["evidence_verified"] for x in done) / sum(x["evidence_total"] for x in done) * 100, 1)
                    if sum(x["evidence_total"] for x in done) else None
                ),
                "note": "Time saved uses the founder's own estimate of manual time unless a benchmark baseline was entered. "
                        "Runs with no accepted evidence are excluded from time-saved averages.",
            },
        }

    return app
