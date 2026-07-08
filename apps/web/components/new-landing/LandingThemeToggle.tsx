"use client";

import { Sparkles, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/utils";

const themes = [
  { value: "light", label: "Classic", icon: Sun },
  { value: "premium", label: "Premium", icon: Sparkles },
] as const;

export function LandingThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeTheme = mounted ? theme || "light" : "light";

  return (
    <div
      className={cn(
        "flex items-center rounded-full border border-[var(--landing-border)] bg-[var(--landing-surface)] p-1 text-xs font-semibold shadow-[var(--landing-shadow-soft)] backdrop-blur-xl transition-colors",
        className,
      )}
      role="group"
      aria-label="Landing page theme"
    >
      {themes.map(({ value, label, icon: Icon }) => {
        const selected = activeTheme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={selected}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 transition-all",
              selected
                ? "bg-[var(--landing-accent)] text-[var(--landing-accent-contrast)] shadow-sm"
                : "text-[var(--landing-muted)] hover:text-[var(--landing-text)]",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
