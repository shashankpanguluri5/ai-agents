"""SQLite storage. Runs keep their working state as one JSON document; events feed the activity log."""

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pitch TEXT NOT NULL,
    target_customer TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'idea',
    industry TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    state TEXT NOT NULL,
    error TEXT,
    manual_baseline_minutes REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


class Database:
    def __init__(self, path: Path | str):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.executescript(SCHEMA)
        self._conn.commit()

    def _exec(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        with self._lock:
            cur = self._conn.execute(sql, params)
            self._conn.commit()
            return cur

    def _all(self, sql: str, params: tuple = ()) -> list[dict]:
        with self._lock:
            return [dict(r) for r in self._conn.execute(sql, params).fetchall()]

    # ----- projects -----
    def create_project(self, name: str, pitch: str, target_customer: str, stage: str, industry: str) -> dict:
        pid = new_id("prj")
        self._exec(
            "INSERT INTO projects (id, name, pitch, target_customer, stage, industry, created_at) VALUES (?,?,?,?,?,?,?)",
            (pid, name, pitch, target_customer, stage, industry, now_iso()),
        )
        return self.get_project(pid)

    def get_project(self, pid: str) -> Optional[dict]:
        rows = self._all("SELECT * FROM projects WHERE id = ?", (pid,))
        return rows[0] if rows else None

    def list_projects(self) -> list[dict]:
        return self._all(
            """SELECT p.*, (SELECT COUNT(*) FROM runs r WHERE r.project_id = p.id) AS run_count,
                      (SELECT r.status FROM runs r WHERE r.project_id = p.id ORDER BY r.created_at DESC LIMIT 1) AS last_status
               FROM projects p ORDER BY p.created_at DESC"""
        )

    def delete_project(self, pid: str) -> None:
        self._exec("DELETE FROM projects WHERE id = ?", (pid,))

    # ----- runs -----
    def create_run(self, project_id: str, state: dict, manual_baseline_minutes: Optional[float]) -> dict:
        rid = new_id("run")
        ts = now_iso()
        self._exec(
            "INSERT INTO runs (id, project_id, status, state, manual_baseline_minutes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
            (rid, project_id, "planning", json.dumps(state), manual_baseline_minutes, ts, ts),
        )
        return self.get_run(rid)

    def get_run(self, rid: str) -> Optional[dict]:
        rows = self._all("SELECT * FROM runs WHERE id = ?", (rid,))
        if not rows:
            return None
        run = rows[0]
        run["state"] = json.loads(run["state"])
        return run

    def list_runs(self, project_id: Optional[str] = None) -> list[dict]:
        if project_id:
            rows = self._all("SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC", (project_id,))
        else:
            rows = self._all("SELECT * FROM runs ORDER BY created_at DESC")
        for r in rows:
            r["state"] = json.loads(r["state"])
        return rows

    def update_run(self, rid: str, *, status: Optional[str] = None, state: Optional[dict] = None,
                   error: Optional[str] = None, manual_baseline_minutes: Optional[float] = None) -> None:
        sets, params = ["updated_at = ?"], [now_iso()]
        if status is not None:
            sets.append("status = ?"); params.append(status)
        if state is not None:
            sets.append("state = ?"); params.append(json.dumps(state))
        if error is not None:
            sets.append("error = ?"); params.append(error)
        if manual_baseline_minutes is not None:
            sets.append("manual_baseline_minutes = ?"); params.append(manual_baseline_minutes)
        params.append(rid)
        self._exec(f"UPDATE runs SET {', '.join(sets)} WHERE id = ?", tuple(params))

    # ----- events -----
    def add_event(self, run_id: str, kind: str, message: str) -> None:
        self._exec("INSERT INTO events (run_id, ts, kind, message) VALUES (?,?,?,?)", (run_id, now_iso(), kind, message[:1000]))

    def list_events(self, run_id: str, after_id: int = 0) -> list[dict[str, Any]]:
        return self._all("SELECT * FROM events WHERE run_id = ? AND id > ? ORDER BY id", (run_id, after_id))
