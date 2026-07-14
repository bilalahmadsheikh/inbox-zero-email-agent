import { ScheduledEmailStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

export type CancelScheduledEmailResult =
  | { ok: true; cancelledCount: number }
  | { ok: false; reason: "not_found" | "chain_finished" | "already_done" };

// Cancels a scheduled email. For recurring chains, the clicked row may
// already have been sent and replaced by a newer occurrence, so this cancels
// every pending row in the same chain, whichever occurrence was targeted.
export async function cancelScheduledEmailChain({
  emailAccountId,
  id,
}: {
  emailAccountId: string;
  id: string;
}): Promise<CancelScheduledEmailResult> {
  const target = await prisma.scheduledEmail.findFirst({
    where: { id, emailAccountId },
    select: { id: true, chainRootId: true, repeatEveryMinutes: true },
  });

  if (!target) return { ok: false, reason: "not_found" };

  const chainRootId = target.chainRootId ?? target.id;

  const result = await prisma.scheduledEmail.updateMany({
    where: {
      emailAccountId,
      status: ScheduledEmailStatus.PENDING,
      OR: [{ id: target.id }, { id: chainRootId }, { chainRootId }],
    },
    data: { status: ScheduledEmailStatus.CANCELLED },
  });

  if (result.count === 0) {
    return {
      ok: false,
      reason: target.repeatEveryMinutes ? "chain_finished" : "already_done",
    };
  }

  return { ok: true, cancelledCount: result.count };
}
