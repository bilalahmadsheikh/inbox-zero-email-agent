"use client";

import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { Switch } from "@/components/ui/switch";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import type { EmailAccountFullResponse } from "@/app/api/user/email-account/route";
import { enableLearnedPatternsAction } from "@/utils/actions/rule";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { BRAND_NAME } from "@/utils/branding";

export function LearnedPatternsSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error, mutate } = useSWR<EmailAccountFullResponse>([
    "/api/user/email-account",
    emailAccountId,
  ]);

  const { execute, isExecuting } = useAction(
    enableLearnedPatternsAction.bind(null, emailAccountId),
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

  const enabled = data?.learnedPatternsEnabled ?? false;

  const handleToggle = (enable: boolean) => {
    if (!data) return;

    mutate({ ...data, learnedPatternsEnabled: enable }, false);
    execute({ enable });
  };

  return (
    <LoadingContent loading={isLoading} error={error}>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Learned patterns</ItemTitle>
          <ItemDescription>
            {`Let ${BRAND_NAME} automatically learn which senders consistently match the same rule - and unlearn it when you remove a label - so future emails from them skip repeated AI classification. Off by default; your existing rules and manual patterns work the same either way.`}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            aria-label="Toggle learned patterns"
            checked={enabled}
            disabled={isLoading || isExecuting}
            onCheckedChange={handleToggle}
          />
        </ItemActions>
      </Item>
    </LoadingContent>
  );
}
