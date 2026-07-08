"use client";

import { Button } from "@/components/Button";
import { usePostHog } from "posthog-js/react";
import { landingPageAnalytics } from "@/hooks/useAnalytics";

export function CTAButtons() {
  const posthog = usePostHog();
  return (
    <div className="mt-10 flex justify-center">
      <Button
        size="2xl"
        color="blue"
        link={{ href: "/login" }}
        onClick={() => landingPageAnalytics.getStartedClicked(posthog)}
      >
        Get Started for Free
      </Button>
    </div>
  );
}
