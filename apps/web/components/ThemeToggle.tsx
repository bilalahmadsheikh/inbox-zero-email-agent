"use client";

import { Sparkles, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/utils";

const themes = [
  { value: "light", label: "Classic", icon: Sun },
  { value: "premium", label: "Premium", icon: Sparkles },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeTheme = mounted ? theme || "light" : "light";

  return (
    <div
      className={cn(
        "flex items-center rounded-full border border-border bg-muted p-1 text-xs font-semibold",
        className,
      )}
      role="group"
      aria-label="App theme"
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
              "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full px-3 transition-all",
              selected
                ? "bg-blue-600 text-white shadow-sm premium:bg-primary premium:text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
