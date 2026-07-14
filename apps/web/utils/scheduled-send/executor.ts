import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ScheduledEmailStatus } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import type { SendEmailBody } from "@/utils/gmail/mail";
import type { Logger } from "@/utils/logger";

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 3;

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

      await prisma.scheduledEmail.update({
        where: { id: scheduledEmail.id },
        data: {
          status: ScheduledEmailStatus.SENT,
          sentMessageId: result.messageId,
          sentThreadId: result.threadId,
          error: null,
        },
      });

      emailLogger.info("Scheduled email sent");
      sent += 1;

      await queueNextOccurrence(scheduledEmail, emailLogger);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isFinal = attempts >= MAX_ATTEMPTS;

      // Non-final failures return to PENDING so the next sweep retries them.
      await prisma.scheduledEmail.update({
        where: { id: scheduledEmail.id },
        data: {
          status: isFinal
            ? ScheduledEmailStatus.FAILED
            : ScheduledEmailStatus.PENDING,
          error: message,
        },
      });

      emailLogger.error("Scheduled email send failed", {
        error,
        attempts,
        willRetry: !isFinal,
      });
      failed += 1;
    }
  }

  return { sent, failed, skipped, total: dueEmails.length };
}

// For recurring follow-ups, queue the next occurrence as a fresh PENDING row
// so per-send history is preserved and a CANCEL_SCHEDULED rule (or manual
// cancel) ends the chain by cancelling the pending row.
async function queueNextOccurrence(
  scheduledEmail: {
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
  },
  logger: Logger,
) {
  const { repeatEveryMinutes, maxOccurrences, occurrence } = scheduledEmail;
  if (!repeatEveryMinutes || !maxOccurrences) return;
  if (occurrence >= maxOccurrences) return;

  try {
    const next = await prisma.scheduledEmail.create({
      data: {
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
      },
    });

    logger.info("Queued next scheduled email occurrence", {
      nextScheduledEmailId: next.id,
      occurrence: occurrence + 1,
      maxOccurrences,
    });
  } catch (error) {
    logger.error("Failed to queue next scheduled email occurrence", { error });
  }
}
