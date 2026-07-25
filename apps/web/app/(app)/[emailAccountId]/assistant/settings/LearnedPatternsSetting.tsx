"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/Toggle";
import { SettingCard } from "@/components/SettingCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/Typography";
import { ViewLearnedPatterns } from "@/app/(app)/[emailAccountId]/assistant/group/ViewLearnedPatterns";
import type { GroupsResponse } from "@/app/api/user/group/route";
import { LoadingContent } from "@/components/LoadingContent";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { enableLearnedPatternsAction } from "@/utils/actions/rule";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { BRAND_NAME } from "@/utils/branding";

export function LearnedPatternsSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  const { execute } = useAction(
    enableLearnedPatternsAction.bind(null, data?.id ?? ""),
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

  const handleToggle = useCallback(
    (enable: boolean) => {
      if (!data) return;

      const optimisticData = {
        ...data,
        learnedPatternsEnabled: enable,
      };
      mutate(optimisticData, false);

      execute({ enable });
    },
    [data, mutate, execute],
  );

  return (
    <SettingCard
      title="Learned patterns"
      description={`Let ${BRAND_NAME} automatically learn which senders consistently match the same rule - and unlearn it when you remove a label - so future emails from them skip repeated AI classification. Off by default; your existing rules and manual patterns work the same either way.`}
      right={
        <div className="flex items-center gap-2">
          <LoadingContent
            loading={isLoading}
            error={error}
            loadingComponent={<Skeleton className="h-8 w-16" />}
          >
            <Toggle
              name="learned-patterns"
              enabled={enabled}
              onChange={handleToggle}
              disabled={isLoading}
            />
          </LoadingContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                View
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Learned patterns</DialogTitle>
                <DialogDescription>
                  When the AI processes your emails, it learns which senders or
                  email types consistently match the same rules. For example, it
                  might learn that emails from newsletter@example.com always
                  match your "Newsletter" rule. These learned patterns help the
                  AI make faster, more accurate decisions over time. You can
                  view, edit, or remove patterns that have been learned.
                </DialogDescription>
              </DialogHeader>
              <Content />
            </DialogContent>
          </Dialog>
        </div>
      }
    />
  );
}

function Content() {
  const { data, isLoading, error } = useSWR<GroupsResponse>("/api/user/group");

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data?.groups.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center p-6">
            <TypographyP>No learned patterns found yet.</TypographyP>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {data?.groups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <CardTitle>{group.rule?.name || "No rule"}</CardTitle>
              </CardHeader>
              <CardContent>
                <ViewLearnedPatterns groupId={group.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </LoadingContent>
  );
}
