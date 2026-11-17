"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutGrid, Menu, Plus, Settings, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, type Health } from "@/lib/api";
import { ThemeToggle } from "./theme-toggle";
import { cx } from "./ui";

const NAV = [
  { href: "/app", label: "Projects", icon: LayoutGrid, exact: true },
  { href: "/app/new", label: "New project", icon: Plus },
  { href: "/app/analytics", label: "Time saved", icon: BarChart3 },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden className="grid size-6 place-items-center rounded-md bg-primary text-primary-ink text-[13px] font-bold">P</span>
      Premise
    </Link>
  );
}

function ModelStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => api.health().then((h) => { if (alive) { setHealth(h); setDown(false); } }).catch(() => alive && setDown(true));
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const active = health?.llm_providers.find((p) => p.available);
  return (
    <Link href="/app/settings" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink-2 hover:bg-surface-2">
      <span aria-hidden className={cx("size-2 rounded-full", down ? "bg-critical" : active ? "bg-good" : health ? "bg-warning" : "bg-line-strong")} />
      {down ? "Backend offline" : active ? `${active.name} · ${active.model}` : health ? "No model available" : "Checking models…"}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 rounded-md px-2 h-8 text-sm",
              active ? "bg-surface-2 text-ink font-medium" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="hidden lg:flex flex-col gap-6 border-r border-line bg-surface px-3 py-4 sticky top-0 h-screen">
        <div className="px-2"><Logo /></div>
        {nav}
        <div className="mt-auto flex flex-col gap-3">
          <ModelStatus />
          <div className="px-2"><ThemeToggle compact /></div>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 h-12">
        <Logo />
        <button aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)} className="p-2 -mr-2">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>
      {open && (
        <div className="lg:hidden border-b border-line bg-surface px-3 py-3 space-y-3">
          {nav}
          <ModelStatus />
          <div className="px-2"><ThemeToggle /></div>
        </div>
      )}

      <main className="min-w-0 px-4 sm:px-8 py-6 sm:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
