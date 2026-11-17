"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, type Assumption, type Category } from "@/lib/api";
import { Badge, Button, Card, ErrorNote, Input, Select, Textarea, cx } from "@/components/ui";

const CATEGORIES: Category[] = ["customer", "problem", "solution", "market", "business_model", "channel", "competition", "team", "other"];

type Draft = Omit<Assumption, "id" | "origin" | "rationale" | "risk"> & { id?: string; rationale?: string; origin?: string; queriesText: string };

const toDraft = (a: Assumption): Draft => ({ ...a, queriesText: a.queries.join("\n") });

export function PlanReview({ runId, objective, assumptions, maxSelected, onDone }:
  { runId: string; objective: string; assumptions: Assumption[]; maxSelected: number; onDone: () => void }) {
  const [items, setItems] = useState<Draft[]>(assumptions.map(toDraft));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "approve" | "stop">("");
  const [error, setError] = useState("");

  const update = (i: number, patch: Partial<Draft>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const selected = items.filter((x) => x.selected).length;

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "stop");
    setError("");
    try {
      await api.planDecision(runId, {
        approve,
        note,
        assumptions: approve ? items.map((x) => ({
          id: x.id,
          statement: x.statement,
          category: x.category,
          kind: x.kind,
          impact: x.impact,
          uncertainty: x.uncertainty,
          queries: x.queriesText.split("\n").map((q) => q.trim()).filter(Boolean).slice(0, 4),
          selected: x.selected,
        })) : [],
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="border-ink/40">
      <div className="px-5 pt-5">
        <Badge className="border-ink/30 text-ink">Checkpoint 1 of 3 · the agent is waiting for you</Badge>
        <h2 className="mt-3 text-lg font-semibold">Review the research plan</h2>
        <p className="mt-1 text-sm text-ink-2">
          These are the beliefs Premise thinks your startup depends on, ranked by <span className="font-medium text-ink">risk = impact × uncertainty</span>.
          Edit anything, add what&apos;s missing, and choose what to research. {objective && <>Goal: {objective}</>}
        </p>
      </div>

      <ul className="mt-4 divide-y divide-line border-t border-line">
        {items.map((a, i) => (
          <li key={a.id ?? `new-${i}`} className={cx("px-5 py-4", !a.selected && "opacity-60")}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={a.selected}
                onChange={(e) => update(i, { selected: e.target.checked })}
                aria-label={`Research: ${a.statement}`}
                className="mt-2.5 size-4 accent-[var(--primary)]"
              />
              <div className="flex-1 min-w-0 space-y-2.5">
                <Textarea rows={2} value={a.statement} onChange={(e) => update(i, { statement: e.target.value })} aria-label="Assumption" />
                {a.rationale && <p className="text-xs text-ink-2">Why it matters: {a.rationale}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Select aria-label="Category" className="w-auto" value={a.category} onChange={(e) => update(i, { category: e.target.value as Category })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                  </Select>
                  <Select aria-label="Kind" className="w-auto" value={a.kind} onChange={(e) => update(i, { kind: e.target.value as Draft["kind"] })}>
                    <option value="assumption">assumption</option>
                    <option value="prediction">prediction</option>
                  </Select>
                  <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">Impact
                    <Select className="w-16" value={a.impact} onChange={(e) => update(i, { impact: Number(e.target.value) })}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
                    </Select>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">Uncertainty
                    <Select className="w-16" value={a.uncertainty} onChange={(e) => update(i, { uncertainty: Number(e.target.value) })}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
                    </Select>
                  </label>
                  <span className="text-xs font-medium tabular">Risk {a.impact * a.uncertainty}/25</span>
                  {a.origin === "founder" && <Badge>added by you</Badge>}
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-ink-2">Search queries ({a.queriesText.split("\n").filter(Boolean).length})</summary>
                  <Textarea className="mt-2 font-mono text-xs" rows={2} value={a.queriesText} onChange={(e) => update(i, { queriesText: e.target.value })}
                    aria-label="Search queries, one per line" placeholder="One search query per line" />
                </details>
              </div>
              <button aria-label="Remove assumption" onClick={() => setItems(items.filter((_, j) => j !== i))} className="p-2 text-muted hover:text-critical">
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="px-5 py-4 border-t border-line space-y-4">
        <Button variant="secondary" onClick={() => setItems([...items, {
          statement: "", category: "customer", kind: "assumption", impact: 3, uncertainty: 3, queries: [], queriesText: "", selected: true, origin: "founder",
        }])}>
          <Plus className="size-4" aria-hidden />Add an assumption
        </Button>
        <Input placeholder="Note for this run (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        {selected > maxSelected && <p className="text-xs text-ink-2">Researching {selected} assumptions will take longer and use more free-tier quota.</p>}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => decide(false)} loading={busy === "stop"}>Stop here</Button>
          <Button onClick={() => decide(true)} loading={busy === "approve"}
            disabled={selected === 0 || items.some((x) => x.selected && x.statement.trim().length < 5)}>
            Approve and research {selected} assumption{selected === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
