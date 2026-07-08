"use client";

import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { Button } from "@/components/new-landing/common/Button";
import { landingPageAnalytics } from "@/hooks/useAnalytics";
import { cn } from "@/utils";

interface CallToActionProps {
  buttonSize?: "xl" | "lg";
  className?: string;
  text?: string;
}

export function CallToAction({
  text = "Get started",
  buttonSize = "xl",
  className,
}: CallToActionProps) {
  const posthog = usePostHog();

  return (
    <div className={cn("flex justify-center", className)}>
      <Button size={buttonSize} asChild>
        <Link
          href="/login"
          onClick={() => landingPageAnalytics.getStartedClicked(posthog)}
        >
          <span className="relative z-10">{text}</span>
        </Link>
      </Button>
    </div>
  );
}
