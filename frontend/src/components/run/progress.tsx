"use client";

import { AlertTriangle, Check, Info, Loader2, Search, UserCheck, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import type { RunEvent, RunStatus } from "@/lib/api";
import { cx } from "@/components/ui";

const STEPS: { key: string; label: string; statuses: RunStatus[]; human?: boolean }[] = [
  { key: "plan", label: "Plan", statuses: ["planning"] },
  { key: "approve-plan", label: "You review plan", statuses: ["awaiting_plan_approval"], human: true },
  { key: "research", label: "Research", statuses: ["researching"] },
  { key: "review-evidence", label: "You judge evidence", statuses: ["awaiting_evidence_review"], human: true },
  { key: "report", label: "Report", statuses: ["reporting"] },
  { key: "approve", label: "You approve", statuses: ["awaiting_final_approval"], human: true },
];

export function Stepper({ status }: { status: RunStatus }) {
  const current = STEPS.findIndex((s) => s.statuses.includes(status));
  const done = status === "completed";
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Workflow progress">
      {STEPS.map((s, i) => {
        const state = done || (current > i) ? "done" : current === i ? (status === "failed" ? "failed" : "current") : "todo";
        return (
          <li key={s.key} className="flex items-center gap-1" aria-current={state === "current" ? "step" : undefined}>
            <span className={cx(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-xs font-medium border",
              state === "done" && "border-line text-ink-2",
              state === "current" && "border-ink bg-surface text-ink",
              state === "todo" && "border-dashed border-line text-muted",
            )}>
              {state === "done" ? <Check className="size-3.5 text-good" aria-hidden />
                : state === "current" && s.human ? <UserCheck className="size-3.5" aria-hidden />
                : state === "current" ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
                : <span aria-hidden className="size-1.5 rounded-full bg-line-strong" />}
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span aria-hidden className="w-3 h-px bg-line-strong" />}
          </li>
        );
      })}
    </ol>
  );
}

const ICON = {
  step: Info,
  tool: Search,
  warning: AlertTriangle,
  error: XCircle,
  checkpoint: UserCheck,
  decision: Check,
};

export function ActivityFeed({ events, live }: { events: RunEvent[]; live: boolean }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);
  return (
    <div>
      <div className="flex items-center justify-between px-4 h-10 border-b border-line">
        <p className="text-sm font-medium">Agent activity</p>
        {live && <span className="inline-flex items-center gap-1.5 text-xs text-ink-2"><span className="size-1.5 rounded-full bg-good animate-pulse" aria-hidden />live</span>}
      </div>
      <ol className="max-h-[420px] overflow-y-auto px-4 py-3 space-y-2.5 text-sm" aria-live="polite">
        {events.map((e) => {
          const Icon = ICON[e.kind] ?? Info;
          return (
            <li key={e.id} className="flex gap-2.5 animate-in">
              <Icon aria-hidden className={cx("size-4 mt-0.5 shrink-0",
                e.kind === "warning" ? "text-warning" : e.kind === "error" ? "text-critical" : e.kind === "checkpoint" ? "text-ink" : "text-muted")} />
              <div className="min-w-0">
                <p className={cx(e.kind === "checkpoint" && "font-medium", "break-words")}>{e.message}</p>
                <p className="text-xs text-muted tabular">{new Date(e.ts).toLocaleTimeString()}</p>
              </div>
            </li>
          );
        })}
        <li ref={end} />
      </ol>
    </div>
  );
}
