"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type MetricsResponse, type Project } from "@/lib/api";
import { ButtonLink, Card, Empty, ErrorNote, StatTile, StatusPill, formatMinutes, timeAgo } from "@/components/ui";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.projects(), api.metrics()])
      .then(([p, m]) => { setProjects(p); setMetrics(m); })
      .catch((e) => setError(e.message));
  }, []);

  const s = metrics?.summary;
  const waiting = projects?.filter((p) => p.last_status?.startsWith("awaiting")) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-ink-2">Each project is one pitch. Run an audit to surface and test its riskiest assumptions.</p>
        </div>
        <ButtonLink href="/app/new"><Plus className="size-4" aria-hidden />New project</ButtonLink>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile label="Completed audits" value={s?.completed_runs ?? "—"} />
        <StatTile label="Avg. time saved" value={s?.avg_time_saved_pct != null ? `${s.avg_time_saved_pct}%` : "—"} hint={s ? `${s.runs_with_baseline} run(s) with a baseline` : undefined} />
        <StatTile label="Avg. time per audit" value={formatMinutes(s?.avg_assisted_minutes)} hint="Agent + your review" />
        <StatTile label="Quotes verified" value={s?.evidence_verified_rate != null ? `${s.evidence_verified_rate}%` : "—"} hint="Found verbatim in the source" />
      </div>

      {waiting.length > 0 && (
        <Card className="px-5 py-4">
          <p className="text-sm font-medium">Waiting for your decision</p>
          <ul className="mt-2 space-y-1">
            {waiting.map((p) => (
              <li key={p.id}><Link className="text-sm text-link hover:underline" href={`/app/projects/${p.id}`}>{p.name}</Link></li>
            ))}
          </ul>
        </Card>
      )}

      {projects && projects.length === 0 && (
        <Empty title="No projects yet">
          Start with your own pitch, or try one of the fictional demo pitches.
          <div className="mt-4"><ButtonLink href="/app/new">Create a project</ButtonLink></div>
        </Empty>
      )}

      {projects && projects.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/app/projects/${p.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2 rounded-xl">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="mt-0.5 text-sm text-ink-2 truncate">{p.pitch}</p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                    {p.last_status ? <StatusPill status={p.last_status} /> : <span className="text-xs text-muted">Not run yet</span>}
                    <span className="text-xs text-muted">{p.run_count} run(s) · {timeAgo(p.created_at)}</span>
                  </div>
                  <ArrowRight className="size-4 text-muted shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
