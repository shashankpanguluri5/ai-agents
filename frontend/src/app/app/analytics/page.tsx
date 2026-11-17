"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type MetricsResponse } from "@/lib/api";
import { Button, Card, CardHeader, Empty, ErrorNote, Input, StatTile, StatusPill, formatMinutes } from "@/components/ui";

type Row = MetricsResponse["runs"][number];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 tabular">
          <span aria-hidden className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-ink-2">{p.name}</span><span className="ml-auto text-ink">{p.value} min</span>
        </p>
      ))}
    </div>
  );
}

function BaselineEditor({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [v, setV] = useState(row.manual_baseline_minutes?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <form className="flex items-center gap-1.5" onSubmit={async (e) => {
      e.preventDefault();
      const n = Number(v);
      if (!(n > 0)) return;
      setBusy(true);
      await api.setBaseline(row.run_id, n).finally(() => setBusy(false));
      onSaved();
    }}>
      <Input className="w-20 h-8" type="number" min={1} value={v} onChange={(e) => setV(e.target.value)} aria-label={`Manual baseline minutes for ${row.project}`} />
      <Button variant="ghost" className="h-8 px-2" loading={busy} disabled={!v}>Save</Button>
    </form>
  );
}

export default function Analytics() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState("");
  const load = () => api.metrics().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const s = data.summary;
  const chart = data.runs
    .filter((r) => r.counts_toward_savings && r.manual_baseline_minutes)
    .slice(0, 12)
    .reverse()
    .map((r) => ({ name: r.project, "Manual (estimate)": r.manual_baseline_minutes, "With Premise (measured)": Math.round(r.assisted_minutes * 10) / 10 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Time saved</h1>
        <p className="mt-1 text-sm text-ink-2 max-w-2xl">
          Time saved (%) = (manual time − AI-assisted time) ÷ manual time × 100. AI-assisted time is <strong className="text-ink font-medium">measured</strong>:
          agent working time plus the time you spent at each checkpoint. Manual time is <strong className="text-ink font-medium">your estimate</strong> unless
          you timed a manual attempt.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile label="Avg. time saved" value={s.avg_time_saved_pct != null ? `${s.avg_time_saved_pct}%` : "—"} hint={`${s.runs_with_baseline} of ${s.completed_runs} completed runs have a baseline`} />
        <StatTile label="Total time saved" value={formatMinutes(s.total_time_saved_minutes)} />
        <StatTile label="Avg. assisted time" value={formatMinutes(s.avg_assisted_minutes)} hint="Agent + your review" />
        <StatTile label="Avg. corrections" value={s.avg_corrections ?? "—"} hint="Your edits per run" />
      </div>

      <Card>
        <CardHeader title="Manual vs. with Premise, per completed run" description="Minutes. Only runs with a manual baseline are shown." />
        <div className="px-3 pb-4 pt-4">
          {chart.length === 0 ? (
            <div className="px-2"><Empty title="No runs with a baseline yet">Complete an audit and enter how long it would take by hand.</Empty></div>
          ) : (
            <>
              <div className="flex gap-4 px-2 pb-3 text-xs text-ink-2">
                <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-series-2" />Manual (estimate)</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-series-1" />With Premise (measured)</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} barGap={2} margin={{ left: 0, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} width={40} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
                    <Bar dataKey="Manual (estimate)" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="With Premise (measured)" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="All runs" description="Failed and stopped runs are included. They count against the agent too." />
        <div className="overflow-x-auto px-5 pb-5 pt-3">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">Project</th><th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium text-right">Agent</th><th className="py-2 pr-3 font-medium text-right">Review</th>
                <th className="py-2 pr-3 font-medium">Manual (min)</th><th className="py-2 pr-3 font-medium text-right">Saved</th>
                <th className="py-2 pr-3 font-medium text-right">Corrections</th><th className="py-2 font-medium text-right">Verified quotes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {data.runs.map((r) => (
                <tr key={r.run_id}>
                  <td className="py-2.5 pr-3"><Link className="text-link hover:underline" href={`/app/runs/${r.run_id}`}>{r.project}</Link></td>
                  <td className="py-2.5 pr-3"><StatusPill status={r.status} /></td>
                  <td className="py-2.5 pr-3 text-right">{formatMinutes(r.agent_minutes)}</td>
                  <td className="py-2.5 pr-3 text-right">{formatMinutes(r.human_review_minutes)}</td>
                  <td className="py-2.5 pr-3"><BaselineEditor row={r} onSaved={load} /></td>
                  <td className="py-2.5 pr-3 text-right">{r.time_saved_pct == null ? "—" : r.counts_toward_savings ? `${r.time_saved_pct}%` : <span className="text-muted" title="Not completed, or no evidence accepted">excluded</span>}</td>
                  <td className="py-2.5 pr-3 text-right">{r.human_corrections}</td>
                  <td className="py-2.5 text-right">{r.evidence_total ? `${r.evidence_verified}/${r.evidence_total}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.runs.length === 0 && <p className="text-sm text-ink-2 py-4">No runs yet.</p>}
        </div>
      </Card>
      <p className="text-xs text-muted">{s.note}</p>
    </div>
  );
}
