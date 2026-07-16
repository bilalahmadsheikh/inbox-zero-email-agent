import type { Prisma } from "@/generated/prisma/client";
import { ScheduledEmailStatus } from "@/generated/prisma/enums";
import { extractEmailAddress } from "@/utils/email";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

// Rule-action helpers operating on the ScheduledEmail queue. Both match
// pending scheduled emails belonging to the triggering email's thread, plus
// unthreaded ones addressed to its sender. Thread-scoped follow-ups are only
// touched by emails arriving in their own thread.

export async function cancelScheduledEmailsToSender({
  emailAccountId,
  from,
  threadId,
  logger,
}: {
  emailAccountId: string;
  from: string;
  threadId?: string | null;
  logger: Logger;
}): Promise<{ cancelledCount: number }> {
  const where = buildMatchingWhere({ emailAccountId, from, threadId, logger });
  if (!where) return { cancelledCount: 0 };

  const result = await prisma.scheduledEmail.updateMany({
    where,
    data: { status: ScheduledEmailStatus.CANCELLED },
  });

  logger.info("Cancelled scheduled emails to sender", {
    cancelledCount: result.count,
  });

  return { cancelledCount: result.count };
}

// One-time stop condition carried by the chain itself (no standing rule):
// when the recipient replies, pending sends flagged cancelOnReply are
// cancelled, and an occurrence that is mid-send is flagged so it is not
// retried and its chain queues no further occurrences. Matching semantics
// are identical to the CANCEL_SCHEDULED rule action above.
export async function cancelOnReplyForIncomingEmail({
  emailAccountId,
  from,
  threadId,
  logger,
}: {
  emailAccountId: string;
  from: string;
  threadId?: string | null;
  logger: Logger;
}): Promise<{ cancelledCount: number }> {
  const where = buildMatchingWhere({ emailAccountId, from, threadId, logger });
  if (!where) return { cancelledCount: 0 };

  const inFlight = await prisma.scheduledEmail.updateMany({
    where: {
      ...where,
      status: ScheduledEmailStatus.SENDING,
      cancelOnReply: true,
    },
    data: { cancelRequested: true },
  });

  const result = await prisma.scheduledEmail.updateMany({
    where: { ...where, cancelOnReply: true },
    data: { status: ScheduledEmailStatus.CANCELLED },
  });

  if (result.count > 0 || inFlight.count > 0) {
    logger.info("Cancelled scheduled emails after recipient reply", {
      cancelledCount: result.count,
      inFlightCount: inFlight.count,
    });
  }

  return { cancelledCount: result.count };
}

export async function releaseScheduledEmailsToSender({
  emailAccountId,
  from,
  threadId,
  logger,
}: {
  emailAccountId: string;
  from: string;
  threadId?: string | null;
  logger: Logger;
}): Promise<{ releasedCount: number }> {
  const where = buildMatchingWhere({ emailAccountId, from, threadId, logger });
  if (!where) return { releasedCount: 0 };

  // Pull sendAt up to now; the scheduled-send cron delivers it within a
  // minute using its normal claim/retry machinery.
  const result = await prisma.scheduledEmail.updateMany({
    where,
    data: { sendAt: new Date() },
  });

  logger.info("Released scheduled emails to sender for immediate delivery", {
    releasedCount: result.count,
  });

  return { releasedCount: result.count };
}

function buildMatchingWhere({
  emailAccountId,
  from,
  threadId,
  logger,
}: {
  emailAccountId: string;
  from: string;
  threadId?: string | null;
  logger: Logger;
}): Prisma.ScheduledEmailWhereInput | null {
  const sender = extractEmailAddress(from);

  const matchers: Prisma.ScheduledEmailWhereInput[] = [
    ...(threadId ? [{ threadId }] : []),
    ...(sender
      ? [
          {
            threadId: null,
            to: { contains: sender, mode: "insensitive" as const },
          },
        ]
      : []),
  ];

  if (matchers.length === 0) {
    logger.warn(
      "Scheduled email rule action: no sender address or thread to match",
    );
    return null;
  }

  return {
    emailAccountId,
    status: ScheduledEmailStatus.PENDING,
    OR: matchers,
  };
}
