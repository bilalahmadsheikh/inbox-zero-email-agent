import { ScheduledEmailStatus } from "@/generated/prisma/enums";
import { extractEmailAddress } from "@/utils/email";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

// Rule-action helpers operating on the ScheduledEmail queue. Both match
// pending scheduled emails whose recipients include the sender of the
// email that triggered the rule.

export async function cancelScheduledEmailsToSender({
  emailAccountId,
  from,
  logger,
}: {
  emailAccountId: string;
  from: string;
  logger: Logger;
}): Promise<{ cancelledCount: number }> {
  const sender = extractEmailAddress(from);
  if (!sender) {
    logger.warn("Cancel scheduled action: could not extract sender address");
    return { cancelledCount: 0 };
  }

  const result = await prisma.scheduledEmail.updateMany({
    where: {
      emailAccountId,
      status: ScheduledEmailStatus.PENDING,
      to: { contains: sender, mode: "insensitive" },
    },
    data: { status: ScheduledEmailStatus.CANCELLED },
  });

  logger.info("Cancelled scheduled emails to sender", {
    cancelledCount: result.count,
  });

  return { cancelledCount: result.count };
}

export async function releaseScheduledEmailsToSender({
  emailAccountId,
  from,
  logger,
}: {
  emailAccountId: string;
  from: string;
  logger: Logger;
}): Promise<{ releasedCount: number }> {
  const sender = extractEmailAddress(from);
  if (!sender) {
    logger.warn("Release scheduled action: could not extract sender address");
    return { releasedCount: 0 };
  }

  // Pull sendAt up to now; the scheduled-send cron delivers it within a
  // minute using its normal claim/retry machinery.
  const result = await prisma.scheduledEmail.updateMany({
    where: {
      emailAccountId,
      status: ScheduledEmailStatus.PENDING,
      to: { contains: sender, mode: "insensitive" },
    },
    data: { sendAt: new Date() },
  });

  logger.info("Released scheduled emails to sender for immediate delivery", {
    releasedCount: result.count,
  });

  return { releasedCount: result.count };
}
