"use client";

import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, CircleDashed, CircleHelp, Loader2, XCircle,
} from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";
import type { Label, RunStatus, Verdict } from "@/lib/api";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink hover:opacity-90",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-critical border border-line hover:bg-surface-2",
};

export function Button({ variant = "primary", loading, className, children, disabled, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md px-3.5 h-9 text-sm font-medium transition",
        "disabled:opacity-50 disabled:pointer-events-none", variants[variant], className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", className, children }:
  { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(
      "inline-flex items-center justify-center gap-2 rounded-md px-3.5 h-9 text-sm font-medium transition",
      variants[variant], className,
    )}>{children}</Link>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const field = "w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-focus";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(field, "h-9", props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(field, "py-2 leading-relaxed", props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(field, "h-9", props.className)} />;
}

export function FieldLabel({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium mb-1.5">
      {children}
      {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-2", className)}>
      {children}
    </span>
  );
}

const STATUS_TEXT: Record<RunStatus, string> = {
  planning: "Planning",
  awaiting_plan_approval: "Needs your review",
  researching: "Researching",
  awaiting_evidence_review: "Needs your review",
  reporting: "Writing report",
  awaiting_final_approval: "Needs your approval",
  completed: "Completed",
  rejected: "Stopped",
  failed: "Failed",
};

export function StatusPill({ status }: { status: RunStatus }) {
  const waiting = status.startsWith("awaiting");
  const active = status === "planning" || status === "researching" || status === "reporting";
  const Icon = status === "completed" ? CheckCircle2 : status === "failed" ? XCircle : waiting ? AlertTriangle : active ? Loader2 : CircleDashed;
  const color = status === "completed" ? "text-good-ink" : status === "failed" ? "text-critical" : waiting ? "text-ink" : "text-ink-2";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs font-medium", color)}>
      <Icon className={cx("size-3.5", active && "animate-spin", waiting && "text-warning")} aria-hidden />
      {STATUS_TEXT[status]}
    </span>
  );
}

// Verdict = state, so it uses the reserved status colors, always with icon + label.
export const VERDICT: Record<Verdict, { label: string; icon: typeof CheckCircle2; color: string }> = {
  supported: { label: "Supported", icon: CheckCircle2, color: "text-good" },
  contradicted: { label: "Contradicted", icon: XCircle, color: "text-critical" },
  mixed: { label: "Mixed", icon: AlertTriangle, color: "text-warning" },
  unproven: { label: "Unproven", icon: CircleHelp, color: "text-muted" },
};

export function VerdictBadge({ verdict, confidence }: { verdict: Verdict; confidence?: string }) {
  const v = VERDICT[verdict];
  const Icon = v.icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink">
      <Icon className={cx("size-3.5", v.color)} aria-hidden />
      {v.label}
      {confidence && <span className="text-muted font-normal">· {confidence} confidence</span>}
    </span>
  );
}

const LABEL_STYLE: Record<Label, string> = {
  fact: "border-ink/30 text-ink",
  assumption: "border-dashed border-line-strong text-ink-2",
  prediction: "border-dotted border-line-strong text-ink-2 italic",
  recommendation: "border-line-strong text-ink-2",
};

export function LabelTag({ label }: { label: Label }) {
  return (
    <span className={cx("inline-flex shrink-0 rounded border px-1.5 py-px text-[11px] font-medium uppercase tracking-wide", LABEL_STYLE[label])}>
      {label}
    </span>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm">
      <XCircle className="size-4 mt-0.5 text-critical shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-2">{hint}</p>}
    </Card>
  );
}

export function formatMinutes(min: number | null | undefined) {
  if (min === null || min === undefined) return "—";
  if (min < 1) return `${Math.max(1, Math.round(min * 60))}s`;
  if (min < 90) return `${Math.round(min)} min`;
  return `${(min / 60).toFixed(1)} h`;
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
