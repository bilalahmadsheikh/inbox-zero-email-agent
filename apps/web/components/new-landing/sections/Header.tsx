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
        // Equal 1fr side columns keep the middle nav column at the exact
        // center of the screen regardless of logo/button widths.
        "sticky top-0 z-50 mx-auto grid h-16 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--landing-border)] bg-[var(--landing-header-bg)] backdrop-blur-xl transition-colors",
        className,
      )}
    >
      <div className="justify-self-start">
        <div className="hidden md:block">
          <Logo />
        </div>
        <div className="block md:hidden">
          <Logo variant="mobile" />
        </div>
      </div>
      <HeaderLinks />
      <div className="flex items-center gap-2 justify-self-end sm:gap-3">
        <LandingThemeToggle />
        <Button
          variant="secondary"
          className="hidden whitespace-nowrap sm:inline-flex"
          asChild
        >
          <Link
            href="/login"
            onClick={() => landingPageAnalytics.logInClicked(posthog)}
          >
            Log in
          </Link>
        </Button>
        <Button className="whitespace-nowrap" asChild>
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
