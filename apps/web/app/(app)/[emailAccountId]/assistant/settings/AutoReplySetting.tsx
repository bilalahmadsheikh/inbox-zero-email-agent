"use client";

import { useAction } from "next-safe-action/hooks";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { updateAutoReplySettingsAction } from "@/utils/actions/rule";
import { showSettingActionError } from "@/utils/actions/error-handling";
import {
  DRAFT_REPLY_CONFIDENCE_OPTIONS,
  getDraftReplyConfidenceOption,
} from "@/utils/ai/reply/draft-confidence";

// "All emails" is meaningless for sending: it would send replies the AI
// flagged as guesses. The bar for sending starts at Standard.
const AUTO_REPLY_CONFIDENCE_OPTIONS = DRAFT_REPLY_CONFIDENCE_OPTIONS.filter(
  (option) => option.value !== DraftReplyConfidence.ALL_EMAILS,
);

export function AutoReplySetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const { executeAsync, isExecuting } = useAction(
    updateAutoReplySettingsAction.bind(null, data?.id ?? ""),
  );

  const enabled = data?.autoReplyEnabled ?? true;
  const confidence =
    data?.autoReplyConfidence ?? DraftReplyConfidence.HIGH_CONFIDENCE;

  const save = async (
    update: { enabled?: boolean; confidence?: DraftReplyConfidence },
    successMessage: string,
  ) => {
    if (!data) return;

    mutate(
      {
        ...data,
        ...(update.enabled !== undefined && {
          autoReplyEnabled: update.enabled,
        }),
        ...(update.confidence && { autoReplyConfidence: update.confidence }),
      },
      false,
    );

    const result = await executeAsync(update);
    if (result?.serverError || result?.validationErrors) {
      showSettingActionError({
        error: {
          serverError: result.serverError,
          validationErrors: result.validationErrors,
        },
        mutate,
        prefix: "Failed to update automatic replies",
      });
      return;
    }

    toastSuccess({ description: successMessage });
    mutate();
  };

  return (
    <SettingCard
      title="Automatic replies"
      description="For rules set to send replies, let the AI send them without you reviewing first. Anything it is unsure about, or that looks automated, becomes a draft instead."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-10 w-64" />}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="w-full sm:w-52">
              <Select
                value={confidence}
                onValueChange={(value) =>
                  save(
                    { confidence: value as DraftReplyConfidence },
                    "Automatic reply confidence updated",
                  )
                }
                disabled={!data || !enabled || isExecuting}
              >
                <SelectTrigger aria-label="Automatic reply confidence">
                  <SelectValue>
                    {getDraftReplyConfidenceOption(confidence).label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end" className="w-[22rem]">
                  {AUTO_REPLY_CONFIDENCE_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="items-start py-2"
                    >
                      <div className="flex flex-col text-left">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Toggle
              name="auto-reply-enabled"
              ariaLabel="Automatic replies"
              enabled={enabled}
              onChange={(nextEnabled) =>
                save(
                  { enabled: nextEnabled },
                  nextEnabled
                    ? "Automatic replies turned on"
                    : "Automatic replies turned off. Queued replies were stopped.",
                )
              }
              disabled={!data || isExecuting}
            />
          </div>
        </LoadingContent>
      }
    />
  );
}
