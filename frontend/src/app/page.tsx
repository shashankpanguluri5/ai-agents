import Link from "next/link";
import { ArrowRight, CheckCircle2, FileSearch, Gauge, ShieldCheck, UserCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const STEPS = [
  { n: "1", title: "Paste your pitch", body: "Premise lists the 6–10 beliefs your startup depends on and ranks them by impact × uncertainty." },
  { n: "2", title: "You approve the plan", body: "Edit, add or drop assumptions and search queries. Nothing is researched until you say so." },
  { n: "3", title: "Evidence, not opinions", body: "The agent reads public sources and extracts exact quotes for and against. Quotes are checked against the page; unverifiable ones are flagged." },
  { n: "4", title: "You judge the evidence", body: "Accept or reject every card, ask for more research, or challenge a conclusion." },
  { n: "5", title: "Leave with tests", body: "Verdicts computed from the evidence you accepted, contradictions, and cheap experiments with success thresholds set in advance." },
];

const FEATURES = [
  { icon: FileSearch, title: "Every claim is labeled", body: "Fact, assumption, prediction or recommendation. A “fact” without a source you accepted is automatically downgraded." },
  { icon: ShieldCheck, title: "Built to resist made-up evidence", body: "Quotes must appear verbatim in the fetched page. Web content is treated as untrusted data, never as instructions." },
  { icon: UserCheck, title: "Three blocking checkpoints", body: "Plan, evidence, and final report. The agent waits for you at each one. It never decides whether to pursue your idea." },
  { icon: Gauge, title: "Time saved, measured", body: "Agent time and your review time are measured per run and compared with your manual baseline." },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-8 h-16">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="grid size-6 place-items-center rounded-md bg-primary text-primary-ink text-[13px] font-bold">P</span>
          Premise
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle compact />
          <Link href="/app" className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-ink px-3.5 h-9 text-sm font-medium hover:opacity-90">
            Open app <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 sm:px-8 pt-16 sm:pt-24 pb-16">
          <p className="text-sm font-medium text-ink-2">An AI research agent for founders · runs on free, open-weight models</p>
          <h1 className="mt-4 max-w-3xl text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1]">
            Find out which of your beliefs could sink your startup, and how to test them this week.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink-2 leading-relaxed">
            Premise turns your pitch into its riskiest assumptions, gathers cited evidence for and against each one,
            and drafts experiments to test them. The agent does the desk research. You decide what it means.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/app/new" className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-ink px-4 h-10 text-sm font-medium hover:opacity-90">
              Audit my pitch <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/app/analytics" className="inline-flex items-center rounded-md border border-line bg-surface px-4 h-10 text-sm font-medium hover:bg-surface-2">
              See measured time savings
            </Link>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 sm:px-8 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((s) => (
                <li key={s.n} className="relative">
                  <span className="grid size-7 place-items-center rounded-full border border-line-strong text-xs font-semibold">{s.n}</span>
                  <h3 className="mt-3 font-medium">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-2 leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 sm:px-8 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Designed for critical thinking, not for replacing it</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-line bg-surface p-5">
                <Icon className="size-5 text-ink-2" aria-hidden />
                <h3 className="mt-3 font-medium">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-2 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          <ul className="mt-10 space-y-2 text-sm text-ink-2">
            {[
              "Runs on Groq's free tier (open-weight models), with a local Ollama model as an offline fallback.",
              "No paid API credits required. Your data stays in a local SQLite database.",
              "Open source. Export every report as Markdown.",
            ].map((t) => (
              <li key={t} className="flex gap-2"><CheckCircle2 className="size-4 mt-0.5 text-good shrink-0" aria-hidden />{t}</li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-8 py-6 text-xs text-muted">
          Premise · built for the AI Agents for Founders Challenge 2026. Research help, not business advice.
        </div>
      </footer>
    </div>
  );
}
