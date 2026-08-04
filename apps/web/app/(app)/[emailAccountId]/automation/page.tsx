import { Suspense } from "react";
import { SparklesIcon } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/utils/prisma";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailProvider } from "@/providers/EmailProvider";
import { getAssistantOnboardingCookie } from "@/utils/cookies";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { AIChatButton } from "@/app/(app)/[emailAccountId]/assistant/AIChatButton";
import { AllRulesDisabledBanner } from "@/app/(app)/[emailAccountId]/assistant/AllRulesDisabledBanner";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { DismissibleVideoCard } from "@/components/VideoCard";
import {
  STEP_KEYS,
  getOnboardingStepHref,
} from "@/app/(app)/[emailAccountId]/onboarding/onboardingFlow";
import { AutomationTabs } from "@/app/(app)/[emailAccountId]/automation/AutomationTabs";

export const maxDuration = 300; // Applies to the actions

export default async function AutomationPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  // Onboarding redirect. The rule check comes first and is per email account:
  // whether this mailbox is configured is a different question from whether
  // the person has seen onboarding before, and only the former should decide
  // if setup is needed. The cookie is the account's own dismissal, so someone
  // who deliberately runs with no rules is not sent back here every visit.
  const hasRule = await prisma.rule.findFirst({
    where: { emailAccountId },
    select: { id: true },
  });

  if (!hasRule) {
    const cookieStore = await cookies();
    const dismissedOnboarding =
      cookieStore.get(getAssistantOnboardingCookie(emailAccountId))?.value ===
      "true";

    if (!dismissedOnboarding) {
      redirect(getOnboardingStepHref(emailAccountId, STEP_KEYS.LABELS));
    }
  }

  return (
    <EmailProvider>
      <Suspense>
        <PermissionsCheck />

        <PageWrapper>
          <div className="flex items-center justify-between">
            <div>
              <PageHeader
                title="AI Assistant"
                video={{
                  title: "Getting started with AI Personal Assistant",
                  description:
                    "Learn how to use the AI Personal Assistant to automatically label, archive, and more.",
                  muxPlaybackId: "VwIP7UAw4MXDjkvmLjJzGsY00ee9jxIZVI952DoBBfp8",
                }}
              />
            </div>

            <div className="ml-4">
              <AIChatButton />
            </div>
          </div>

          <AllRulesDisabledBanner />

          <DismissibleVideoCard
            className="my-4"
            icon={<SparklesIcon className="h-5 w-5" />}
            title="Getting started with AI Assistant"
            description="Learn how to use the AI Assistant to automatically label, archive, and more."
            muxPlaybackId="VwIP7UAw4MXDjkvmLjJzGsY00ee9jxIZVI952DoBBfp8"
            storageKey="ai-assistant-onboarding-video"
            videoAnalytics={{
              page: "automation",
              surface: "dismissible_card",
            }}
          />

          <AutomationTabs />
        </PageWrapper>
      </Suspense>
    </EmailProvider>
  );
}
