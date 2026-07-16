import { ScheduledEmailStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

export type CancelScheduledEmailResult =
  | { ok: true; cancelledCount: number; inFlightCount: number }
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
  const chainFilter = {
    emailAccountId,
    OR: [{ id: target.id }, { id: chainRootId }, { chainRootId }],
  };

  // Flag executor-claimed (SENDING) rows before cancelling pending ones:
  // if the in-flight send fails it is cancelled instead of retried, and the
  // executor retracts a next occurrence it queues after seeing the flag.
  // Flagging first means an occurrence that finishes sending mid-cancel is
  // caught either by its flag or by the pending-row sweep below — there is
  // no interleaving where both miss.
  const inFlight = await prisma.scheduledEmail.updateMany({
    where: { ...chainFilter, status: ScheduledEmailStatus.SENDING },
    data: { cancelRequested: true },
  });

  const result = await prisma.scheduledEmail.updateMany({
    where: { ...chainFilter, status: ScheduledEmailStatus.PENDING },
    data: { status: ScheduledEmailStatus.CANCELLED },
  });

  if (result.count === 0 && inFlight.count === 0) {
    return {
      ok: false,
      reason: target.repeatEveryMinutes ? "chain_finished" : "already_done",
    };
  }

  return {
    ok: true,
    cancelledCount: result.count,
    inFlightCount: inFlight.count,
  };
}
