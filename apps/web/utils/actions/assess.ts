"use server";

import prisma from "@/utils/prisma";
import { assessUser } from "@/utils/assess";
import { aiAnalyzeWritingStyle } from "@/utils/ai/knowledge/writing-style";
import { formatBulletList } from "@/utils/string";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { actionClient } from "@/utils/actions/safe-action";
import { createEmailProvider } from "@/utils/email/provider";
import { SafeError } from "@/utils/error";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
// How many recent sent emails to analyze for the writing-style profile.
const WRITING_STYLE_SENT_SAMPLE = 50;
// Don't re-check for drift more often than this, so it never runs on every load.
const WRITING_STYLE_REFRESH_MIN_DAYS = 30;
// Re-analyze only once at least this many new emails were sent since the last
// analysis — the "drift" signal that the style may have moved on.
const WRITING_STYLE_DRIFT_THRESHOLD = 25;

// to help with onboarding and provide the best flow to new users
export const assessAction = actionClient
  .metadata({ name: "assessUser" })
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { behaviorProfile: true },
    });

    if (emailAccount?.behaviorProfile) return { success: true, skipped: true };

    const result = await assessUser({ client: emailProvider, logger });
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { behaviorProfile: result },
    });

    return { success: true };
  });

export const analyzeWritingStyleAction = actionClient
  .metadata({ name: "analyzeWritingStyle" })
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        writingStyle: true,
        writingStyleUpdatedAt: true,
        id: true,
        userId: true,
        email: true,
        about: true,
        multiRuleSelectionEnabled: true,
        sensitiveDataPolicy: true,
        timezone: true,
        calendarBookingLink: true,
        user: { select: { aiProvider: true, aiModel: true, aiApiKey: true } },
      },
    });

    if (!emailAccount) throw new SafeError("Email account not found");

    const styleUpdatedAt = emailAccount.writingStyleUpdatedAt;
    const isRefresh = !!emailAccount.writingStyle;

    if (isRefresh) {
      // A style with no auto timestamp is manually set (or legacy) and owned by
      // the user — never auto-overwrite it.
      if (!styleUpdatedAt) return { success: true, skipped: true };
      // Throttle: only re-check occasionally, not on every app load.
      const daysSinceRefresh =
        (Date.now() - styleUpdatedAt.getTime()) / MS_PER_DAY;
      if (daysSinceRefresh < WRITING_STYLE_REFRESH_MIN_DAYS) {
        return { success: true, skipped: true };
      }
    }

    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });
    const sentMessages = await emailProvider.getSentMessages(
      WRITING_STYLE_SENT_SAMPLE,
    );

    if (isRefresh && styleUpdatedAt) {
      // Drift signal: only re-analyze once enough new mail has been sent since
      // the style was last built.
      const newSentCount = sentMessages.filter((message) => {
        const dateStr = message.headers?.date;
        if (!dateStr) return false;
        const date = new Date(dateStr);
        return !Number.isNaN(date.getTime()) && date > styleUpdatedAt;
      }).length;

      if (newSentCount < WRITING_STYLE_DRIFT_THRESHOLD) {
        // Not enough drift yet — record that we checked so we don't re-fetch
        // sent mail until the next interval, and keep the existing style.
        await prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: { writingStyleUpdatedAt: new Date() },
        });
        return { success: true, skipped: true };
      }
    }

    // analyze writing style
    const style = await aiAnalyzeWritingStyle({
      emails: sentMessages.map((email) =>
        getEmailForLLM(email, { extractReply: true }),
      ),
      emailAccount: { ...emailAccount, account: { provider } },
    });

    if (!style) return;

    // save writing style
    const writingStyle = [
      style.typicalLength ? `Typical Length: ${style.typicalLength}` : null,
      style.formality ? `Formality: ${style.formality}` : null,
      style.commonGreeting ? `Common Greeting: ${style.commonGreeting}` : null,
      style.notableTraits.length
        ? `Notable Traits: ${formatBulletList(style.notableTraits)}`
        : null,
      style.examples.length
        ? `Examples: ${formatBulletList(style.examples)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { writingStyle, writingStyleUpdatedAt: new Date() },
    });

    return { success: true };
  });
