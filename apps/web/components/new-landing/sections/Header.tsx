"use client";

import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { cn } from "@/utils";
import { Logo } from "@/components/new-landing/common/Logo";
import { Button } from "@/components/new-landing/common/Button";
import { HeaderLinks } from "@/components/new-landing/HeaderLinks";
import { LandingThemeToggle } from "@/components/new-landing/LandingThemeToggle";
import { landingPageAnalytics } from "@/hooks/useAnalytics";

interface HeaderProps {
  className: string;
}

export function Header({ className }: HeaderProps) {
  const posthog = usePostHog();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 mx-auto flex h-16 items-center justify-between border-b border-[var(--landing-border)] bg-[var(--landing-header-bg)] backdrop-blur-xl transition-colors",
        className,
      )}
    >
      <div className="hidden md:block">
        <Logo />
      </div>
      <div className="block md:hidden">
        <Logo variant="mobile" />
      </div>
      <HeaderLinks />
      <div className="flex items-center gap-2 sm:gap-3">
        <LandingThemeToggle />
        <Button variant="secondary" className="hidden sm:inline-flex" asChild>
          <Link
            href="/login"
            onClick={() => landingPageAnalytics.logInClicked(posthog)}
          >
            Log in
          </Link>
        </Button>
        <Button asChild>
          <Link
            href="/login"
            onClick={() => landingPageAnalytics.getStartedClicked(posthog)}
          >
            <span className="relative z-10">Get started free</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
