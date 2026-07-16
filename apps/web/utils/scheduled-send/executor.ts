import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ScheduledEmailStatus } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import type { SendEmailBody } from "@/utils/gmail/mail";
import type { Logger } from "@/utils/logger";

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 3;

type ClaimedScheduledEmail = {
  id: string;
  emailAccountId: string;
  to: string;
  cc: string | null;
  bcc: string | null;
  replyTo: string | null;
  subject: string;
  messageHtml: string;
  replyToEmail: unknown;
  threadId: string | null;
  repeatEveryMinutes: number | null;
  maxOccurrences: number | null;
  occurrence: number;
  chainRootId: string | null;
  cancelOnReply: boolean;
};

export async function processScheduledEmails(logger: Logger) {
  const now = new Date();

  const dueEmails = await prisma.scheduledEmail.findMany({
    where: {
      status: ScheduledEmailStatus.PENDING,
      sendAt: { lte: now },
    },
    orderBy: { sendAt: "asc" },
    take: BATCH_SIZE,
    include: {
      emailAccount: {
        include: { account: { select: { provider: true } } },
      },
    },
  });

  if (dueEmails.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, total: 0 };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const scheduledEmail of dueEmails) {
    const emailLogger = logger.with({
      scheduledEmailId: scheduledEmail.id,
      emailAccountId: scheduledEmail.emailAccountId,
    });

    // Atomic claim so concurrent sweeps can never double-send.
    const claim = await prisma.scheduledEmail.updateMany({
      where: { id: scheduledEmail.id, status: ScheduledEmailStatus.PENDING },
      data: {
        status: ScheduledEmailStatus.SENDING,
        attempts: { increment: 1 },
      },
    });

    if (claim.count === 0) {
      skipped += 1;
      continue;
    }

    const attempts = scheduledEmail.attempts + 1;

    try {
      const providerName = scheduledEmail.emailAccount?.account?.provider;
      if (!providerName) {
        throw new Error("Email account or provider missing");
      }

      const provider = await createEmailProvider({
        emailAccountId: scheduledEmail.emailAccountId,
        provider: providerName,
        logger: emailLogger,
      });

      const result = await provider.sendEmailWithHtml({
        to: scheduledEmail.to,
        cc: scheduledEmail.cc ?? undefined,
        bcc: scheduledEmail.bcc ?? undefined,
        replyTo: scheduledEmail.replyTo ?? undefined,
        subject: scheduledEmail.subject,
        messageHtml: scheduledEmail.messageHtml,
        replyToEmail:
          (scheduledEmail.replyToEmail as SendEmailBody["replyToEmail"]) ??
          undefined,
      });

      const sentData = {
        status: ScheduledEmailStatus.SENT,
        sentMessageId: result.messageId,
        sentThreadId: result.threadId,
        error: null,
      };

      const nextOccurrenceData = buildNextOccurrenceData(scheduledEmail);
      if (nextOccurrenceData) {
        await markSentAndQueueNextOccurrence({
          scheduledEmail,
          sentData,
          nextOccurrenceData,
          logger: emailLogger,
        });
      } else {
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmail.id },
          data: sentData,
        });
      }

      emailLogger.info("Scheduled email sent");
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isFinal = attempts >= MAX_ATTEMPTS;

      // Non-final failures return to PENDING so the next sweep retries them —
      // unless a cancel arrived while the send was in flight, in which case
      // the row must not re-enter the queue.
      const reverted = await prisma.scheduledEmail.updateMany({
        where: {
          id: scheduledEmail.id,
          status: ScheduledEmailStatus.SENDING,
          cancelRequested: false,
        },
        data: {
          status: isFinal
            ? ScheduledEmailStatus.FAILED
            : ScheduledEmailStatus.PENDING,
          error: message,
        },
      });

      if (reverted.count === 0) {
        await prisma.scheduledEmail.updateMany({
          where: {
            id: scheduledEmail.id,
            status: ScheduledEmailStatus.SENDING,
          },
          data: { status: ScheduledEmailStatus.CANCELLED, error: message },
        });
        emailLogger.info("Cancelled failed send after mid-send cancel request");
      }

      emailLogger.error("Scheduled email send failed", {
        error,
        attempts,
        willRetry: !isFinal && reverted.count > 0,
      });
      failed += 1;
    }
  }

  return { sent, failed, skipped, total: dueEmails.length };
}

// For recurring follow-ups, the next occurrence is a fresh PENDING row so
// per-send history is preserved and a CANCEL_SCHEDULED rule (or manual
// cancel) ends the chain by cancelling the pending row.
function buildNextOccurrenceData(
  scheduledEmail: ClaimedScheduledEmail,
): Prisma.ScheduledEmailUncheckedCreateInput | null {
  const { repeatEveryMinutes, maxOccurrences, occurrence } = scheduledEmail;
  if (!repeatEveryMinutes || !maxOccurrences) return null;
  if (occurrence >= maxOccurrences) return null;

  return {
    emailAccountId: scheduledEmail.emailAccountId,
    to: scheduledEmail.to,
    cc: scheduledEmail.cc,
    bcc: scheduledEmail.bcc,
    replyTo: scheduledEmail.replyTo,
    subject: scheduledEmail.subject,
    messageHtml: scheduledEmail.messageHtml,
    replyToEmail:
      (scheduledEmail.replyToEmail as Prisma.InputJsonValue) ?? undefined,
    threadId: scheduledEmail.threadId,
    sendAt: new Date(Date.now() + repeatEveryMinutes * 60_000),
    repeatEveryMinutes,
    maxOccurrences,
    occurrence: occurrence + 1,
    chainRootId: scheduledEmail.chainRootId ?? scheduledEmail.id,
    cancelOnReply: scheduledEmail.cancelOnReply,
  };
}

// Marking SENT and queueing the next occurrence commit together so a cancel
// can never observe the chain between occurrences and report it finished.
async function markSentAndQueueNextOccurrence({
  scheduledEmail,
  sentData,
  nextOccurrenceData,
  logger,
}: {
  scheduledEmail: ClaimedScheduledEmail;
  sentData: {
    status: ScheduledEmailStatus;
    sentMessageId: string | null;
    sentThreadId: string | null;
    error: null;
  };
  nextOccurrenceData: Prisma.ScheduledEmailUncheckedCreateInput;
  logger: Logger;
}) {
  let next: { id: string } | null = null;
  try {
    const [, created] = await prisma.$transaction([
      prisma.scheduledEmail.update({
        where: { id: scheduledEmail.id },
        data: sentData,
      }),
      prisma.scheduledEmail.create({ data: nextOccurrenceData }),
    ]);
    next = created;

    logger.info("Queued next scheduled email occurrence", {
      nextScheduledEmailId: created.id,
      occurrence: scheduledEmail.occurrence + 1,
      maxOccurrences: scheduledEmail.maxOccurrences,
    });
  } catch (error) {
    // The email really was sent; record that even if queueing failed, and
    // end the chain rather than risking a duplicate send via retry.
    logger.error("Failed to queue next scheduled email occurrence", { error });
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmail.id },
      data: sentData,
    });
  }

  if (next) {
    await retractNextOccurrenceIfCancelRequested({
      scheduledEmail,
      nextId: next.id,
      logger,
    });
  }
}

// A cancel that lands while an occurrence is mid-send can only flag the
// SENDING row or cancel now-stale siblings — it cannot see the next row this
// sweep is about to queue. Honor that cancel here, after queueing.
async function retractNextOccurrenceIfCancelRequested({
  scheduledEmail,
  nextId,
  logger,
}: {
  scheduledEmail: ClaimedScheduledEmail;
  nextId: string;
  logger: Logger;
}) {
  const chainRootId = scheduledEmail.chainRootId ?? scheduledEmail.id;

  try {
    const cancelSignal = await prisma.scheduledEmail.findFirst({
      where: {
        emailAccountId: scheduledEmail.emailAccountId,
        AND: [
          { OR: [{ id: chainRootId }, { chainRootId }] },
          {
            OR: [
              { cancelRequested: true },
              { status: ScheduledEmailStatus.CANCELLED },
            ],
          },
        ],
      },
      select: { id: true },
    });
    if (!cancelSignal) return;

    await prisma.scheduledEmail.updateMany({
      where: { id: nextId, status: ScheduledEmailStatus.PENDING },
      data: { status: ScheduledEmailStatus.CANCELLED },
    });
    logger.info("Retracted next occurrence after mid-send cancel request", {
      nextScheduledEmailId: nextId,
    });
  } catch (error) {
    logger.error("Failed to check for mid-send cancel request", { error });
  }
}
