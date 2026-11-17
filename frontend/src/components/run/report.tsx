"use client";

import { AlertTriangle, Download, FlaskConical, MessageSquareWarning, Search } from "lucide-react";
import { useState } from "react";
import { api, type Assessment, type Assumption, type Challenge, type Evidence, type Run } from "@/lib/api";
import { Badge, Button, Card, CardHeader, ErrorNote, LabelTag, Textarea, VerdictBadge, cx } from "@/components/ui";
import { EvidenceCard } from "./evidence";

/** Diverging bar: accepted evidence against (left, red) vs for (right, blue), one row per assumption. */
function EvidenceBalance({ rows }: { rows: { a: Assumption; x: Assessment }[] }) {
  const max = Math.max(1, ...rows.map(({ x }) => Math.max(x.counts.supports, x.counts.contradicts)));
  const [hover, setHover] = useState<string | null>(null);
  return (
    <figure>
      <figcaption className="sr-only">Accepted evidence for and against each assumption</figcaption>
      <div className="flex items-center justify-between text-xs text-ink-2 mb-2">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-[var(--div-neg)]" />Against</span>
        <span className="inline-flex items-center gap-1.5">For<span aria-hidden className="size-2.5 rounded-sm bg-[var(--div-pos)]" /></span>
      </div>
      <ul className="space-y-2.5">
        {rows.map(({ a, x }) => {
          const tip = `${x.counts.supports} for · ${x.counts.contradicts} against · ${x.counts.neutral} neutral · ${x.counts.sources} source(s)`;
          return (
            <li key={a.id} className="relative" onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(a.id)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${a.statement}: ${tip}`}>
              <p className="text-xs text-ink-2 truncate mb-1">{a.statement}</p>
              <div className="grid grid-cols-2 gap-[2px] h-3.5">
                <div className="flex justify-end">
                  <div className="h-full rounded-l bg-[var(--div-neg)]" style={{ width: `${(x.counts.contradicts / max) * 100}%` }} />
                </div>
                <div className="flex border-l border-line-strong">
                  <div className="h-full rounded-r bg-[var(--div-pos)]" style={{ width: `${(x.counts.supports / max) * 100}%` }} />
                </div>
              </div>
              {hover === a.id && (
                <div role="tooltip" className="absolute right-0 -top-1 z-10 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm tabular">{tip}</div>
              )}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function ChallengeBox({ runId, assumptionId, items, onAdded }:
  { runId: string; assumptionId: string; items: Challenge[]; onAdded: (c: Challenge) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask() {
    setBusy(true);
    setError("");
    try {
      onAdded(await api.challenge(runId, assumptionId, q));
      setQ("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 space-y-3">
      {items.map((c) => (
        <div key={c.id} className="rounded-lg bg-surface-2 p-3 text-sm space-y-1.5">
          <p className="font-medium">You: {c.question}</p>
          <p className="flex gap-2"><LabelTag label={c.label} /><span>{c.answer}</span></p>
          {c.suggested_query && <p className="text-xs text-ink-2 inline-flex items-center gap-1"><Search className="size-3" aria-hidden />Suggested search: {c.suggested_query}</p>}
        </div>
      ))}
      <div className="flex flex-col sm:flex-row gap-2">
        <Textarea rows={1} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Challenge this conclusion: e.g. “Does this hold for rural bakeries?”" aria-label="Challenge this conclusion" />
        <Button variant="secondary" onClick={ask} loading={busy} disabled={q.trim().length < 5} className="shrink-0">
          <MessageSquareWarning className="size-4" aria-hidden />Challenge
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

export function ReportView({ run, onChange }: { run: Run; onChange: () => void }) {
  const s = run.state;
  const [challenges, setChallenges] = useState<Challenge[]>(s.challenges);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<"" | "approve" | "revise">("");
  const [error, setError] = useState("");
  if (!s.analysis) return null;

  const asm = Object.fromEntries(s.assumptions.map((a) => [a.id, a]));
  const ev = Object.fromEntries(s.evidence.map((e) => [e.id, e])) as Record<string, Evidence>;
  const rows = s.analysis.assessments.map((x) => ({ a: asm[x.assumption_id], x })).filter((r) => r.a).sort((p, q) => q.a.risk - p.a.risk);
  const awaiting = run.status === "awaiting_final_approval";

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "revise");
    setError("");
    try {
      await api.finalDecision(run.id, { approve, feedback });
      setFeedback("");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function exportMd() {
    try {
      const md = await api.reportMarkdown(run.id);
      const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `premise-${run.project.name.replace(/\W+/g, "-").toLowerCase()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {awaiting && (
        <Card className="border-ink/40 p-5">
          <Badge className="border-ink/30 text-ink">Checkpoint 3 of 3 · the agent is waiting for you</Badge>
          <h2 className="mt-3 text-lg font-semibold">Approve the report, or send it back</h2>
          <p className="mt-1 text-sm text-ink-2">Read the verdicts and the critic&apos;s notes below. If something is wrong or missing, tell the agent what to change.</p>
          <Textarea className="mt-3" rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback for a revision (optional)" aria-label="Feedback" />
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => decide(false)} loading={busy === "revise"} disabled={feedback.trim().length < 3}>Revise with feedback</Button>
            <Button onClick={() => decide(true)} loading={busy === "approve"}>Approve report</Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{run.status === "completed" ? "Approved report" : "Draft report"}</h2>
        <Button variant="secondary" onClick={exportMd}><Download className="size-4" aria-hidden />Export Markdown</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Summary" />
          <p className="px-5 pb-5 pt-2 text-sm leading-relaxed">{s.analysis.summary}</p>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3">Evidence balance</h3>
          <EvidenceBalance rows={rows} />
        </Card>
      </div>

      {s.critic_issues.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold inline-flex items-center gap-2"><AlertTriangle className="size-4 text-warning" aria-hidden />Critic&apos;s notes on this draft</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-ink-2">{s.critic_issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </Card>
      )}

      {s.analysis.contradictions.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Contradictions found</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-ink-2">{s.analysis.contradictions.map((c, i) => <li key={i}>{c.description}</li>)}</ul>
        </Card>
      )}

      <div className="space-y-4">
        {rows.map(({ a, x }) => {
          const accepted = s.evidence.filter((e) => e.assumption_id === a.id && e.decision === "accepted");
          return (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-medium max-w-2xl">{a.statement}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted tabular">risk {a.risk}/25</span>
                  <VerdictBadge verdict={x.verdict} confidence={x.confidence} />
                </div>
              </div>
              <p className="mt-2 text-sm text-ink-2 leading-relaxed">{x.reasoning}</p>
              <ul className="mt-3 space-y-2">
                {x.statements.map((st, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <LabelTag label={st.label} />
                    <span>
                      {st.text}{" "}
                      {st.evidence_ids.map((id) => ev[id] && (
                        <a key={id} href={ev[id].url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-link hover:underline mr-1">[{ev[id].domain}]</a>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              {accepted.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-ink-2">{accepted.length} accepted source(s)</summary>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">{accepted.map((e) => <EvidenceCard key={e.id} e={e} />)}</div>
                </details>
              )}
              <ChallengeBox runId={run.id} assumptionId={a.id} items={challenges.filter((c) => c.assumption_id === a.id)}
                onAdded={(c) => setChallenges([...challenges, c])} />
            </Card>
          );
        })}
      </div>

      {s.test_plan && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><FlaskConical className="size-4" aria-hidden />Test plan</span>}
              description="Success thresholds are set before you run a test, so the result can't be rationalised afterwards." />
            <div className="overflow-x-auto px-5 pb-5 pt-3">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr><th className="py-2 pr-3 font-medium">Assumption</th><th className="py-2 pr-3 font-medium">Experiment</th><th className="py-2 pr-3 font-medium">Success if</th><th className="py-2 font-medium">Effort</th></tr>
                </thead>
                <tbody className="divide-y divide-line align-top">
                  {s.test_plan.tests.map((t, i) => (
                    <tr key={i}>
                      <td className="py-2.5 pr-3 text-ink-2 min-w-40">{asm[t.assumption_id]?.statement}</td>
                      <td className="py-2.5 pr-3 min-w-56">{t.experiment}<p className="text-xs text-muted mt-1">Measure: {t.metric} · {t.timeframe}</p></td>
                      <td className="py-2.5 pr-3 min-w-36">{t.success_threshold}</td>
                      <td className="py-2.5">{t.effort}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Interview script" description="Ask about past behaviour, not hypothetical purchases." />
            <ol className="px-5 pb-5 pt-3 list-decimal pl-9 space-y-1.5 text-sm">{s.test_plan.interview_questions.map((q) => <li key={q}>{q}</li>)}</ol>
          </Card>
        </div>
      )}

      {s.test_plan?.limitations?.length ? (
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Limitations</h3>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-ink-2">{s.test_plan.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </Card>
      ) : null}

      {!awaiting && error && <ErrorNote>{error}</ErrorNote>}
      <p className={cx("text-xs text-muted")}>Premise is a research aid. It labels what is sourced and what is not; decisions about your business are yours.</p>
    </div>
  );
}
