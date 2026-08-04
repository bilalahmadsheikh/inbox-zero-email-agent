"use client";

import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";

/**
 * Escape hatch from the step-by-step flow. Fixed to the corner rather than
 * placed in the step body so it reads as "leave setup" rather than as the
 * primary action of whichever step you happen to be on.
 */
export function SkipOnboardingButton({
  onClick,
  isLoading,
}: {
  onClick: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="fixed top-4 right-4 z-50">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={isLoading}
      >
        {isLoading && <ButtonLoader />}
        Use defaults & skip setup
      </Button>
    </div>
  );
}
