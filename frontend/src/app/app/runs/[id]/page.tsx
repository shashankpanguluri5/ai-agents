"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVE, api, type Run } from "@/lib/api";
import { Card, ErrorNote, StatTile, StatusPill, formatMinutes } from "@/components/ui";
import { ActivityFeed, Stepper } from "@/components/run/progress";
import { PlanReview } from "@/components/run/plan-review";
import { EvidenceCard, EvidenceReview } from "@/components/run/evidence";
import { ReportView } from "@/components/run/report";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.run(id);
      setRun(r);
      setError("");
      if (ACTIVE.includes(r.status)) timer.current = setTimeout(load, 2000);
    } catch (e) {
      setError((e as Error).message);
      timer.current = setTimeout(load, 5000);
    }
  }, [id]);

  useEffect(() => {
    load();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  const refresh = () => {
    if (timer.current) clearTimeout(timer.current);
    load();
  };

  if (!run) return error ? <ErrorNote>{error}</ErrorNote> : <p className="text-sm text-muted">Loading…</p>;

  const s = run.state;
  const live = ACTIVE.includes(run.status);
  const m = run.metrics;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/app/projects/${run.project_id}`} className="text-sm text-ink-2 hover:text-ink">{run.project.name}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Assumption audit</h1>
          <StatusPill status={run.status} />
        </div>
      </div>

      <Card className="px-4 py-3 overflow-x-auto"><Stepper status={run.status} /></Card>
      {error && <ErrorNote>{error}</ErrorNote>}
      {run.status === "failed" && (
        <ErrorNote>
          The run stopped: {run.error}. Check that a model is available in <Link className="underline" href="/app/settings">Settings</Link>, then start a new run from the project page.
        </ErrorNote>
      )}
      {run.status === "rejected" && <Card className="p-5 text-sm text-ink-2">You stopped this run at the plan review. Nothing was researched.</Card>}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px] items-start">
        <div className="min-w-0 space-y-6">
          {run.status === "planning" && (
            <Card className="p-6">
              <p className="font-medium">Reading your pitch…</p>
              <p className="mt-1 text-sm text-ink-2">The agent is listing the beliefs your startup depends on. On the free cloud model this takes seconds; on the local fallback model, a minute or two.</p>
              <div className="mt-4 space-y-2" aria-hidden>
                {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-md bg-surface-2 animate-pulse" />)}
              </div>
            </Card>
          )}

          {run.status === "awaiting_plan_approval" && (
            <PlanReview runId={run.id} objective={s.objective} assumptions={s.assumptions} maxSelected={6} onDone={refresh} />
          )}

          {run.status === "researching" && (
            <Card className="p-5">
              <p className="font-medium">Researching {s.assumptions.filter((a) => a.selected).length} assumptions</p>
              <p className="mt-1 text-sm text-ink-2">Evidence cards appear as they are found. You&apos;ll judge each one next.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {s.evidence.map((e) => <EvidenceCard key={e.id} e={e} />)}
              </div>
            </Card>
          )}

          {run.status === "awaiting_evidence_review" && (
            <EvidenceReview runId={run.id} assumptions={s.assumptions} evidence={s.evidence} onDone={refresh} />
          )}

          {run.status === "reporting" && (
            <Card className="p-6">
              <p className="font-medium">Writing the report</p>
              <p className="mt-1 text-sm text-ink-2">Weighing accepted evidence, designing tests, then a critic pass checks the draft for overclaiming.</p>
            </Card>
          )}

          {(run.status === "awaiting_final_approval" || run.status === "completed") && <ReportView run={run} onChange={refresh} />}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6">
          <Card><ActivityFeed events={run.events} live={live} /></Card>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Agent time" value={formatMinutes(m.agent_minutes)} />
            <StatTile label="Your review" value={formatMinutes(m.human_review_minutes)} />
            <StatTile label="Corrections" value={m.human_corrections} hint="Edits, rejections, revisions" />
            <StatTile label="Time saved" value={m.time_saved_pct != null ? `${m.time_saved_pct}%` : "—"}
              hint={m.manual_baseline_minutes ? `vs. your ${m.manual_baseline_minutes} min estimate` : "Add a baseline on the analytics page"} />
          </div>
        </aside>
      </div>
    </div>
  );
}
