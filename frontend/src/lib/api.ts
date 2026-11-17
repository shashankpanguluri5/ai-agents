// Typed client for the Premise FastAPI backend.

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type RunStatus =
  | "planning"
  | "awaiting_plan_approval"
  | "researching"
  | "awaiting_evidence_review"
  | "reporting"
  | "awaiting_final_approval"
  | "completed"
  | "rejected"
  | "failed";

export type Category =
  | "customer" | "problem" | "solution" | "market" | "business_model" | "channel" | "competition" | "team" | "other";
export type Stance = "supports" | "contradicts" | "neutral";
export type Label = "fact" | "assumption" | "prediction" | "recommendation";
export type Verdict = "supported" | "contradicted" | "mixed" | "unproven";

export interface Project {
  id: string;
  name: string;
  pitch: string;
  target_customer: string;
  stage: string;
  industry: string;
  created_at: string;
  run_count?: number;
  last_status?: RunStatus | null;
}

export interface Assumption {
  id: string;
  statement: string;
  category: Category;
  kind: "assumption" | "prediction";
  rationale: string;
  impact: number;
  uncertainty: number;
  risk: number;
  queries: string[];
  origin: "agent" | "founder";
  selected: boolean;
}

export interface Evidence {
  id: string;
  assumption_id: string;
  url: string;
  title: string;
  domain: string;
  query: string;
  quote: string;
  stance: Stance;
  summary: string;
  verified: boolean;
  snippet_only: boolean;
  decision: "pending" | "accepted" | "rejected";
  note: string;
}

export interface Statement { text: string; label: Label; evidence_ids: string[] }

export interface Assessment {
  assumption_id: string;
  verdict: Verdict;
  confidence: "low" | "medium" | "high";
  counts: { supports: number; contradicts: number; neutral: number; sources: number };
  reasoning: string;
  statements: Statement[];
}

export interface Test {
  assumption_id: string;
  experiment: string;
  metric: string;
  success_threshold: string;
  effort: "low" | "medium" | "high";
  timeframe: string;
}

export interface Challenge {
  id: string;
  assumption_id: string;
  question: string;
  answer: string;
  label: Label;
  evidence_ids: string[];
  suggested_query: string;
  ts: string;
}

export interface RunState {
  objective: string;
  assumptions: Assumption[];
  evidence: Evidence[];
  analysis: {
    summary: string;
    assessments: Assessment[];
    contradictions: { description: string; assumption_ids: string[]; evidence_ids: string[] }[];
  } | null;
  test_plan: { tests: Test[]; interview_questions: string[]; limitations: string[] } | null;
  critic_issues: string[];
  challenges: Challenge[];
  checkpoints: { name: string; opened_at: string; decided_at: string | null; decision: string | null }[];
  corrections: Record<string, number>;
  feedback_history: { ts: string; feedback: string }[];
  providers_used: Record<string, number>;
}

export interface Metrics {
  counts_toward_savings: boolean;
  agent_minutes: number;
  human_review_minutes: number;
  assisted_minutes: number;
  manual_baseline_minutes: number | null;
  baseline_source: string | null;
  time_saved_minutes: number | null;
  time_saved_pct: number | null;
  human_corrections: number;
  corrections: Record<string, number>;
  evidence_total: number;
  evidence_verified: number;
  evidence_accepted: number;
  evidence_rejected: number;
  providers_used: Record<string, number>;
}

export interface RunEvent { id: number; ts: string; kind: "step" | "tool" | "warning" | "error" | "checkpoint" | "decision"; message: string }

export interface Run {
  id: string;
  project_id: string;
  status: RunStatus;
  state: RunState;
  error: string | null;
  manual_baseline_minutes: number | null;
  created_at: string;
  updated_at: string;
  project: Project;
  events: RunEvent[];
  metrics: Metrics;
}

export interface ProjectDetail extends Project {
  runs: { id: string; status: RunStatus; created_at: string; updated_at: string; metrics: Metrics }[];
}

export interface Health {
  ok: boolean;
  llm_providers: { name: string; model: string; available: boolean }[];
  search_providers: string[];
}

export interface MetricsResponse {
  runs: (Metrics & { run_id: string; project: string; status: RunStatus; created_at: string })[];
  summary: {
    completed_runs: number;
    runs_with_baseline: number;
    avg_time_saved_pct: number | null;
    total_time_saved_minutes: number | null;
    avg_assisted_minutes: number | null;
    avg_corrections: number | null;
    evidence_verified_rate: number | null;
    note: string;
  };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, `Can't reach the Premise backend at ${API_URL}. Is it running?`);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : (body.detail?.[0]?.msg ?? JSON.stringify(body.detail));
    } catch {}
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") || "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => request<Health>("/api/health"),
  projects: () => request<Project[]>("/api/projects"),
  project: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  createProject: (body: Pick<Project, "name" | "pitch" | "target_customer" | "stage" | "industry">) =>
    post<Project>("/api/projects", body),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  startRun: (projectId: string, manual_baseline_minutes?: number) =>
    post<Run>(`/api/projects/${projectId}/runs`, manual_baseline_minutes ? { manual_baseline_minutes } : {}),
  run: (id: string) => request<Run>(`/api/runs/${id}`),
  planDecision: (id: string, body: { approve: boolean; assumptions?: unknown[]; note?: string }) =>
    post<{ status: RunStatus }>(`/api/runs/${id}/plan-decision`, body),
  evidenceDecision: (id: string, body: { decisions: { evidence_id: string; decision: "accepted" | "rejected"; note?: string }[]; more_research?: { assumption_id: string; query: string }[] }) =>
    post<{ status: RunStatus }>(`/api/runs/${id}/evidence-decision`, body),
  finalDecision: (id: string, body: { approve: boolean; feedback?: string }) =>
    post<{ status: RunStatus }>(`/api/runs/${id}/final-decision`, body),
  challenge: (id: string, assumption_id: string, question: string) =>
    post<Challenge>(`/api/runs/${id}/challenge`, { assumption_id, question }),
  setBaseline: (id: string, manual_baseline_minutes: number) =>
    post<Metrics>(`/api/runs/${id}/baseline`, { manual_baseline_minutes }),
  reportMarkdown: (id: string) => request<string>(`/api/runs/${id}/report.md`),
  metrics: () => request<MetricsResponse>("/api/metrics"),
};

export const ACTIVE: RunStatus[] = ["planning", "researching", "reporting"];
