import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/utils/prisma";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailProvider } from "@/providers/EmailProvider";
import { getAssistantOnboardingCookie } from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import { Chat } from "@/components/assistant-chat/chat";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";

export const maxDuration = 300; // Applies to the actions

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  // Per email account, and checked before the cookie: see the note in
  // automation/page.tsx. A mailbox with no rules needs setup regardless of
  // whether this person has onboarded a different account before.
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
      redirect(prefixPath(emailAccountId, "/assistant?onboarding=true"));
    }
  }

  return (
    <EmailProvider>
      <Suspense>
        <PermissionsCheck />

        <div className="flex h-[calc(100vh-theme(spacing.9)-theme(spacing.14)-env(safe-area-inset-bottom))] md:h-screen flex-col">
          <Chat open />
        </div>
      </Suspense>
    </EmailProvider>
  );
}
