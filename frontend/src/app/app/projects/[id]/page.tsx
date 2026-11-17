"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type ProjectDetail } from "@/lib/api";
import { Badge, Button, Card, CardHeader, Empty, ErrorNote, FieldLabel, Input, StatusPill, formatMinutes, timeAgo } from "@/components/ui";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.project(id).then(setProject).catch((e) => setError(e.message));
  }, [id]);

  async function start() {
    setBusy(true);
    try {
      const n = Number(baseline);
      const run = await api.startRun(id, n > 0 ? n : undefined);
      router.push(`/app/runs/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this project and all its runs? This can't be undone.")) return;
    await api.deleteProject(id);
    router.push("/app");
  }

  if (error && !project) return <ErrorNote>{error}</ErrorNote>;
  if (!project) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/app" className="text-sm text-ink-2 hover:text-ink">Projects</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{project.stage}</Badge>
            {project.industry && <Badge>{project.industry}</Badge>}
          </div>
        </div>
        <Button variant="danger" onClick={remove}><Trash2 className="size-4" aria-hidden />Delete</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Pitch" />
          <div className="px-5 pb-5 pt-3 space-y-3 text-sm leading-relaxed">
            <p className="whitespace-pre-wrap">{project.pitch}</p>
            {project.target_customer && <p className="text-ink-2"><span className="font-medium text-ink">Target customer:</span> {project.target_customer}</p>}
          </div>
        </Card>

        <Card className="p-5 h-fit">
          <h2 className="text-[15px] font-semibold">Run a new audit</h2>
          <p className="mt-1 text-sm text-ink-2">Each run is a fresh pass with new searches.</p>
          <div className="mt-4">
            <FieldLabel htmlFor="bl" hint="optional">Manual time estimate</FieldLabel>
            <div className="flex items-center gap-2">
              <Input id="bl" type="number" min={1} value={baseline} onChange={(e) => setBaseline(e.target.value)} placeholder="minutes" />
            </div>
          </div>
          <Button className="mt-4 w-full" onClick={start} loading={busy}>Start audit</Button>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        </Card>
      </div>

      <div>
        <h2 className="text-[15px] font-semibold mb-3">Runs</h2>
        {project.runs.length === 0 ? (
          <Empty title="No runs yet" />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {project.runs.map((r) => (
                <li key={r.id}>
                  <Link href={`/app/runs/${r.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2 rounded-xl">
                    <StatusPill status={r.status} />
                    <span className="text-sm text-ink-2 flex-1">{timeAgo(r.created_at)}</span>
                    <span className="hidden sm:inline text-sm text-ink-2 tabular">{formatMinutes(r.metrics.assisted_minutes)} total</span>
                    {r.metrics.time_saved_pct != null && <span className="hidden sm:inline text-sm font-medium tabular">{r.metrics.time_saved_pct}% saved</span>}
                    <ArrowRight className="size-4 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
