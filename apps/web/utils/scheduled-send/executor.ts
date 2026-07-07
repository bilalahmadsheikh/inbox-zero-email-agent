import prisma from "@/utils/prisma";
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
