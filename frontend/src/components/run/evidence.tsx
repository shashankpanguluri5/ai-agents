"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, ExternalLink, Minus, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api, type Assumption, type Evidence } from "@/lib/api";
import { Badge, Button, Card, ErrorNote, Input, cx } from "@/components/ui";

const STANCE = {
  supports: { label: "Supports", icon: ArrowUpRight },
  contradicts: { label: "Contradicts", icon: ArrowDownRight },
  neutral: { label: "Neutral", icon: Minus },
};

export function EvidenceCard({ e, decision, onDecide }:
  { e: Evidence; decision?: "accepted" | "rejected" | "pending"; onDecide?: (d: "accepted" | "rejected") => void }) {
  const st = STANCE[e.stance];
  const Icon = st.icon;
  const d = decision ?? e.decision;
  return (
    <div className={cx("rounded-lg border bg-surface p-4 animate-in", d === "rejected" ? "border-line opacity-55" : d === "accepted" ? "border-ink/40" : "border-line")}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cx("inline-flex items-center gap-1 font-medium", e.stance === "supports" ? "text-[var(--div-pos)]" : e.stance === "contradicts" ? "text-[var(--div-neg)]" : "text-ink-2")}>
          <Icon className="size-3.5" aria-hidden />{st.label}
        </span>
        <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-link hover:underline">
          {e.domain}<ExternalLink className="size-3" aria-hidden />
        </a>
        {e.verified ? (
          <span className="inline-flex items-center gap-1 text-ink-2"><ShieldCheck className="size-3.5 text-good" aria-hidden />Quote verified in source</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-ink"><AlertTriangle className="size-3.5 text-warning" aria-hidden />Quote not found verbatim: check before accepting</span>
        )}
        {e.snippet_only && <Badge>search snippet only</Badge>}
      </div>
      <blockquote className="mt-2.5 border-l-2 border-line-strong pl-3 text-sm leading-relaxed">&ldquo;{e.quote}&rdquo;</blockquote>
      {e.summary && <p className="mt-2 text-xs text-ink-2">{e.summary}</p>}
      {onDecide && (
        <div className="mt-3 flex gap-2">
          <Button variant={d === "accepted" ? "primary" : "secondary"} className="h-8" onClick={() => onDecide("accepted")} aria-pressed={d === "accepted"}>
            <Check className="size-4" aria-hidden />Accept
          </Button>
          <Button variant={d === "rejected" ? "primary" : "secondary"} className="h-8" onClick={() => onDecide("rejected")} aria-pressed={d === "rejected"}>
            <X className="size-4" aria-hidden />Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export function EvidenceReview({ runId, assumptions, evidence, onDone }:
  { runId: string; assumptions: Assumption[]; evidence: Evidence[]; onDone: () => void }) {
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "rejected" | "pending">>(
    Object.fromEntries(evidence.map((e) => [e.id, e.decision])),
  );
  const [more, setMore] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = assumptions.filter((a) => a.selected);
  const pending = Object.values(decisions).filter((d) => d === "pending").length;
  const moreList = Object.entries(more).filter(([, q]) => q.trim().length >= 3).map(([assumption_id, query]) => ({ assumption_id, query: query.trim() }));
  const byAsm = useMemo(() => {
    const m: Record<string, Evidence[]> = {};
    evidence.forEach((e) => (m[e.assumption_id] ||= []).push(e));
    return m;
  }, [evidence]);

  const acceptVerified = () =>
    setDecisions(Object.fromEntries(evidence.map((e) => [e.id, decisions[e.id] !== "pending" ? decisions[e.id] : e.verified ? "accepted" : "pending"])));

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api.evidenceDecision(runId, {
        decisions: Object.entries(decisions).filter(([, d]) => d !== "pending").map(([evidence_id, decision]) => ({ evidence_id, decision: decision as "accepted" | "rejected" })),
        more_research: moreList,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-ink/40">
      <div className="px-5 pt-5">
        <Badge className="border-ink/30 text-ink">Checkpoint 2 of 3 · the agent is waiting for you</Badge>
        <h2 className="mt-3 text-lg font-semibold">Judge the evidence</h2>
        <p className="mt-1 text-sm text-ink-2">
          Only evidence you accept counts toward a verdict. Reject anything irrelevant, outdated or biased.
          If an assumption needs more, give the agent a search query.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Button variant="secondary" className="h-8" onClick={acceptVerified}>Accept all verified, undecided cards</Button>
          <span className="text-ink-2 tabular">{pending} undecided</span>
        </div>
      </div>

      <div className="mt-4 border-t border-line divide-y divide-line">
        {selected.map((a) => (
          <section key={a.id} className="px-5 py-5" aria-label={a.statement}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{a.statement}</h3>
              <span className="text-xs text-muted tabular">risk {a.risk}/25 · {(byAsm[a.id] || []).length} card(s)</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {(byAsm[a.id] || []).map((e) => (
                <EvidenceCard key={e.id} e={e} decision={decisions[e.id]} onDecide={(d) => setDecisions({ ...decisions, [e.id]: d })} />
              ))}
              {!(byAsm[a.id] || []).length && <p className="text-sm text-ink-2">No usable sources found. Try a different query below.</p>}
            </div>
            <div className="mt-3 max-w-xl">
              <Input value={more[a.id] || ""} onChange={(e) => setMore({ ...more, [a.id]: e.target.value })}
                placeholder="Need more? Type a search query for the agent" aria-label={`More research query for: ${a.statement}`} />
            </div>
          </section>
        ))}
      </div>

      <div className="px-5 py-4 border-t border-line space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {moreList.length === 0 && pending > 0 && <span className="text-sm text-ink-2">Decide on every card to continue.</span>}
          <Button onClick={submit} loading={busy} disabled={moreList.length === 0 && pending > 0}>
            {moreList.length > 0 ? `Save and research ${moreList.length} more` : "Continue to report"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
