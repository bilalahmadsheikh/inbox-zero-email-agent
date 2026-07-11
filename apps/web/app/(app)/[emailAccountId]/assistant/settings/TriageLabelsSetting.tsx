"use client";

import { useCallback } from "react";
import { Toggle } from "@/components/Toggle";
import { enableTriageLabelsAction } from "@/utils/actions/rule";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { SettingCard } from "@/components/SettingCard";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingContent } from "@/components/LoadingContent";
import { TooltipExplanation } from "@/components/TooltipExplanation";

export function TriageLabelsSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  const { execute } = useAction(
    enableTriageLabelsAction.bind(null, data?.id ?? ""),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: "There was an error",
      }),
    },
  );

  const enabled = data?.triageLabelsEnabled ?? false;

  const handleToggle = useCallback(
    (enable: boolean) => {
      if (!data) return;

      const optimisticData = {
        ...data,
        triageLabelsEnabled: enable,
      };
      mutate(optimisticData, false);

      execute({ enable });
    },
    [data, mutate, execute],
  );

  return (
    <SettingCard
      title={
        <div className="flex items-center gap-1.5">
          <span>Priority labels in your mailbox</span>
          <TooltipExplanation
            side="top"
            text="Applies a Priority/Urgent, Priority/Important, or Priority/FYI label (Gmail) or category (Outlook) to each processed email, so tiers are visible in your email client too."
          />
        </div>
      }
      description="Tag processed emails with their priority tier directly in Gmail or Outlook."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="triage-labels"
            enabled={enabled}
            onChange={handleToggle}
            disabled={isLoading}
          />
        </LoadingContent>
      }
    />
  );
}
