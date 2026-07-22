"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { Toggle } from "@/components/Toggle";
import { SettingCard } from "@/components/SettingCard";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { toggleAlwaysReadDraftAttachmentsAction } from "@/utils/actions/settings";

export function DraftAttachmentsSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const { emailAccountId } = useAccount();

  const { execute } = useAction(
    toggleAlwaysReadDraftAttachmentsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: "Failed to update attachment reading setting",
      }),
    },
  );

  const enabled = data?.alwaysReadDraftAttachments ?? false;

  const handleToggle = useCallback(
    (nextEnabled: boolean) => {
      if (!data) return;

      mutate({ ...data, alwaysReadDraftAttachments: nextEnabled }, false);

      execute({ enabled: nextEnabled });
    },
    [data, execute, mutate],
  );

  return (
    <SettingCard
      title="Read attachments before drafting"
      description="When on, every AI draft and reply reads supported incoming documents (PDF, Word) first, so it can use their contents. This applies everywhere, including Reply Zero. You can also enable it for a single rule instead."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="always-read-draft-attachments"
            enabled={enabled}
            onChange={handleToggle}
            disabled={isLoading}
          />
        </LoadingContent>
      }
    />
  );
}
