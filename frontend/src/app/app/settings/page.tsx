"use client";

import { CheckCircle2, CircleDashed, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { API_URL, api, type Health } from "@/lib/api";
import { Button, Card, CardHeader, ErrorNote } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Settings() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => {
    setBusy(true);
    api.health().then((h) => { setHealth(h); setError(""); }).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };
  useEffect(load, []);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader title="Models" description="Tried in order. If the first is rate-limited or offline, Premise falls back to the next. All are free to use."
          action={<Button variant="secondary" onClick={load} loading={busy}><RefreshCw className="size-4" aria-hidden />Recheck</Button>} />
        <div className="px-5 pb-5 pt-3 space-y-3">
          {error && <ErrorNote>{error}</ErrorNote>}
          {health?.llm_providers.map((p, i) => (
            <div key={p.name} className="flex items-center gap-3 rounded-lg border border-line px-4 py-3">
              <span className="text-xs text-muted tabular w-4">{i + 1}</span>
              {p.available ? <CheckCircle2 className="size-4 text-good" aria-hidden /> : <CircleDashed className="size-4 text-muted" aria-hidden />}
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.name === "groq" ? "Groq free tier" : "Ollama (local)"} · <span className="font-mono text-xs">{p.model}</span></p>
                <p className="text-xs text-ink-2">
                  {p.available ? "Available" : p.name === "groq"
                    ? "Not configured: add GROQ_API_KEY to backend/.env (free key at console.groq.com)"
                    : `Not running, or model not pulled: run "ollama pull ${p.model}"`}
                </p>
              </div>
            </div>
          ))}
          {health && <p className="text-xs text-ink-2">Web search: {health.search_providers.join(" → ")}</p>}
          <p className="text-xs text-muted">Backend: <span className="font-mono">{API_URL}</span>. API keys live only in the backend&apos;s .env file and are never sent to the browser.</p>
        </div>
      </Card>

      <Card className="p-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">Appearance</h2>
          <p className="text-sm text-ink-2 mt-1">Light, dark, or follow your system.</p>
        </div>
        <ThemeToggle />
      </Card>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">Your data</h2>
        <p className="text-sm text-ink-2 mt-1">
          Projects and reports are stored in a local SQLite file on the machine running the backend. Pitches are sent to the model
          provider you configured (Groq, or nowhere if you use Ollama). Search queries are sent to the search provider.
          Don&apos;t paste confidential information you aren&apos;t allowed to share with those services.
        </p>
      </Card>
    </div>
  );
}
