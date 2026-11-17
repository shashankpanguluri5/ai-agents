"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "./ui";

type Pref = "light" | "dark" | "system";
const KEY = "premise-theme";

function apply(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [pref, setPref] = useState<Pref>("system");

  useEffect(() => {
    try {
      setPref((localStorage.getItem(KEY) as Pref) || "system");
    } catch {}
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let p: Pref = "system";
      try { p = (localStorage.getItem(KEY) as Pref) || "system"; } catch {}
      if (p === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const choose = (p: Pref) => {
    setPref(p);
    try { localStorage.setItem(KEY, p); } catch {}
    apply(p);
  };

  const options: { value: Pref; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ];

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded px-2 h-7 text-xs",
            pref === value ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}
