import Link from "next/link";
import { Logo as Wordmark } from "@/components/Logo";
import { cn } from "@/utils";

interface LogoProps {
  variant?: "default" | "mobile";
}

export function Logo({ variant = "default" }: LogoProps) {
  const sizeClass = variant === "mobile" ? "h-12 w-auto" : "h-16 w-auto";

  return (
    <Link href="/">
      <Wordmark
        className={cn(
          sizeClass,
          "text-[var(--landing-text)] transition-colors",
          // The wordmark's dark text is unreadable on the dark premium
          // background, so render it as a clean white logo there.
          "[.premium_&]:brightness-0 [.premium_&]:invert",
        )}
      />
    </Link>
  );
}
