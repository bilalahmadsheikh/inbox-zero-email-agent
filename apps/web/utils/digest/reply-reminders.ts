import prisma from "@/utils/prisma";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import {
  getElapsedBusinessDaysForDisplay,
  hasElapsedBusinessDays,
} from "@/utils/date";
import { extractNameFromEmail } from "@/utils/email";
import { env } from "@/env";
import { prefixPath } from "@/utils/path";
import { getThreadIdsWithActiveScheduledChain } from "@/utils/scheduled-send/active-chain";

// Reply reminders surfaced proactively in the digest, alongside rule-based
// items. "Awaiting your reply" = threads the user still needs to respond to;
// "Waiting on others" = threads the user sent that are overdue a response.
// Both reuse the follow-up day thresholds so the digest and the escalation
// channel agree on what counts as overdue.
export const AWAITING_YOUR_REPLY_DIGEST_KEY = "awaitingYourReply";
export const WAITING_ON_OTHERS_DIGEST_KEY = "waitingOnOthers";

export const REPLY_REMINDER_RULE_NAMES: Record<string, string> = {
  [AWAITING_YOUR_REPLY_DIGEST_KEY]: "Awaiting your reply",
  [WAITING_ON_OTHERS_DIGEST_KEY]: "Waiting on others",
};

type DigestItem = { from: string; subject: string; content: string };

// Bounds how many trackers we scan and how many messages we fetch per section,
// so a large backlog can't blow up digest send time or provider rate limits.
const MAX_TRACKER_SCAN = 100;
const MAX_REMINDERS_PER_SECTION = 15;
// Mirrors the follow-up engine so an item that just crossed the threshold is
// treated the same way in both places.
const REMINDER_ELIGIBILITY_WINDOW_MINUTES = 15;

export async function getReplyReminderDigestSections({
  emailAccountId,
  timezone,
  needsReplyDays,
  awaitingReplyDays,
  provider,
  now,
  logger,
}: {
  emailAccountId: string;
  timezone: string | null | undefined;
  needsReplyDays: number | null;
  awaitingReplyDays: number | null;
  provider: EmailProvider;
  now: Date;
  logger: Logger;
}): Promise<{
  itemsByRule: Record<string, DigestItem[]>;
  ruleNames: Record<string, string>;
}> {
  const [awaitingYourReply, waitingOnOthers] = await Promise.all([
    buildSection({
      emailAccountId,
      trackerType: ThreadTrackerType.NEEDS_REPLY,
      thresholdDays: needsReplyDays,
      tab: "needsReply",
      counterparty: "from",
      buildContent: (days, url) =>
        `Waiting on your reply for ${formatDays(days)} · Open in Reply Zero: ${url}`,
      timezone,
      provider,
      now,
      logger,
    }),
    buildSection({
      emailAccountId,
      trackerType: ThreadTrackerType.AWAITING,
      thresholdDays: awaitingReplyDays,
      tab: "awaitingReply",
      counterparty: "to",
      buildContent: (days, url) =>
        `No reply for ${formatDays(days)} · Draft a follow-up in Reply Zero: ${url}`,
      // Defer to any active scheduled follow-up chain: if the user already has
      // the app auto-chasing this thread, don't also nudge them to chase it.
      skipThreadsWithActiveScheduledChain: true,
      timezone,
      provider,
      now,
      logger,
    }),
  ]);

  const itemsByRule: Record<string, DigestItem[]> = {};
  const ruleNames: Record<string, string> = {};

  if (awaitingYourReply.length > 0) {
    itemsByRule[AWAITING_YOUR_REPLY_DIGEST_KEY] = awaitingYourReply;
    ruleNames[AWAITING_YOUR_REPLY_DIGEST_KEY] =
      REPLY_REMINDER_RULE_NAMES[AWAITING_YOUR_REPLY_DIGEST_KEY];
  }
  if (waitingOnOthers.length > 0) {
    itemsByRule[WAITING_ON_OTHERS_DIGEST_KEY] = waitingOnOthers;
    ruleNames[WAITING_ON_OTHERS_DIGEST_KEY] =
      REPLY_REMINDER_RULE_NAMES[WAITING_ON_OTHERS_DIGEST_KEY];
  }

  return { itemsByRule, ruleNames };
}

async function buildSection({
  emailAccountId,
  trackerType,
  thresholdDays,
  tab,
  counterparty,
  buildContent,
  skipThreadsWithActiveScheduledChain = false,
  timezone,
  provider,
  now,
  logger,
}: {
  emailAccountId: string;
  trackerType: ThreadTrackerType;
  thresholdDays: number | null;
  tab: string;
  counterparty: "from" | "to";
  buildContent: (elapsedBusinessDays: number, url: string) => string;
  skipThreadsWithActiveScheduledChain?: boolean;
  timezone: string | null | undefined;
  provider: EmailProvider;
  now: Date;
  logger: Logger;
}): Promise<DigestItem[]> {
  // An unset threshold means the user hasn't opted into reminders for this
  // type, so the section is skipped (consistent with the escalation channel).
  if (thresholdDays === null) return [];

  const trackers = await prisma.threadTracker.findMany({
    where: { emailAccountId, type: trackerType, resolved: false },
    orderBy: { sentAt: "asc" },
    take: MAX_TRACKER_SCAN,
    select: { threadId: true, messageId: true, sentAt: true },
  });

  let candidates = trackers.filter((tracker) =>
    hasElapsedBusinessDays({
      start: tracker.sentAt,
      end: now,
      days: thresholdDays,
      windowMinutes: REMINDER_ELIGIBILITY_WINDOW_MINUTES,
      timezone,
    }),
  );

  if (skipThreadsWithActiveScheduledChain && candidates.length > 0) {
    const activeChainThreadIds = await getThreadIdsWithActiveScheduledChain({
      emailAccountId,
      threadIds: candidates.map((tracker) => tracker.threadId),
    });
    candidates = candidates.filter(
      (tracker) => !activeChainThreadIds.has(tracker.threadId),
    );
  }

  const overdue = candidates.slice(0, MAX_REMINDERS_PER_SECTION);

  if (overdue.length === 0) return [];

  const deepLink = `${env.NEXT_PUBLIC_BASE_URL}${prefixPath(
    emailAccountId,
    `/reply-zero?tab=${tab}`,
  )}`;

  let messages: Awaited<ReturnType<EmailProvider["getMessagesBatch"]>>;
  try {
    messages = await provider.getMessagesBatch(overdue.map((t) => t.messageId));
  } catch (error) {
    logger.error("Failed to fetch messages for reply reminder digest", {
      error,
      trackerType,
    });
    return [];
  }

  const messageById = new Map(messages.map((message) => [message.id, message]));

  const items: DigestItem[] = [];
  for (const tracker of overdue) {
    const message = messageById.get(tracker.messageId);
    if (!message) continue;

    const header =
      counterparty === "to" ? message.headers.to : message.headers.from;
    const elapsedBusinessDays = getElapsedBusinessDaysForDisplay({
      start: tracker.sentAt,
      end: now,
      timezone,
    });

    items.push({
      from: extractNameFromEmail(header || "") || header || "someone",
      subject: message.headers.subject || "(no subject)",
      content: buildContent(elapsedBusinessDays, deepLink),
    });
  }

  return items;
}

function formatDays(days: number) {
  return `${days} business day${days === 1 ? "" : "s"}`;
}
