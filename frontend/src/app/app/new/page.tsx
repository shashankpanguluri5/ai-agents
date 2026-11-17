"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { DEMO_PITCHES } from "@/lib/demo";
import { Button, Card, ErrorNote, FieldLabel, Input, Select, Textarea } from "@/components/ui";

const STAGES = ["idea", "prototype", "pre-revenue", "early revenue", "growth"];

export default function NewProject() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", pitch: "", target_customer: "", stage: "idea", industry: "" });
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const pitchShort = form.pitch.trim().length < 50;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const project = await api.createProject(form);
      const minutes = Number(baseline);
      const run = await api.startRun(project.id, minutes > 0 ? minutes : undefined);
      router.push(`/app/runs/${run.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="mt-1 text-sm text-ink-2">Describe the startup in your own words. The more specific you are about who pays and why, the sharper the assumptions.</p>
      </div>

      <Card className="px-5 py-4">
        <p className="text-sm font-medium">Try a demo pitch</p>
        <p className="text-xs text-muted mt-0.5">Fictional startups, for trying Premise out.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_PITCHES.map((d) => (
            <Button key={d.name} type="button" variant="secondary" onClick={() => setForm({ ...d })}>{d.name}</Button>
          ))}
        </div>
      </Card>

      <form onSubmit={submit} className="space-y-5">
        <Card className="p-5 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="name">Startup name</FieldLabel>
              <Input id="name" required minLength={2} maxLength={120} value={form.name} onChange={set("name")} />
            </div>
            <div>
              <FieldLabel htmlFor="industry" hint="optional">Industry</FieldLabel>
              <Input id="industry" maxLength={120} value={form.industry} onChange={set("industry")} />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="pitch" hint={`${form.pitch.length}/8000`}>Pitch</FieldLabel>
            <Textarea id="pitch" required rows={7} minLength={50} maxLength={8000} value={form.pitch} onChange={set("pitch")}
              placeholder="What you're building, for whom, the problem it solves, how you'll charge, and how you'll reach customers." />
            {form.pitch.length > 0 && pitchShort && <p className="mt-1 text-xs text-ink-2">Add a bit more detail (at least 50 characters).</p>}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="tc" hint="optional">Target customer</FieldLabel>
              <Input id="tc" maxLength={500} value={form.target_customer} onChange={set("target_customer")} />
            </div>
            <div>
              <FieldLabel htmlFor="stage">Stage</FieldLabel>
              <Select id="stage" value={form.stage} onChange={set("stage")}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <FieldLabel htmlFor="baseline" hint="optional, used to measure time saved">
            How long would this research take you by hand?
          </FieldLabel>
          <div className="flex items-center gap-2 max-w-xs">
            <Input id="baseline" type="number" min={1} max={6000} inputMode="numeric" value={baseline} onChange={(e) => setBaseline(e.target.value)} placeholder="e.g. 180" />
            <span className="text-sm text-ink-2">minutes</span>
          </div>
          <p className="mt-2 text-xs text-muted">Listing your assumptions, searching for evidence on each, and writing up tests. It&apos;s your estimate, and it&apos;s labeled that way in reports.</p>
        </Card>

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={pitchShort || form.name.trim().length < 2}>Create and start audit</Button>
        </div>
      </form>
    </div>
  );
}
