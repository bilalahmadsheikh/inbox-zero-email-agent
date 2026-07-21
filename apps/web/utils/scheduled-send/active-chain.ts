import prisma from "@/utils/prisma";
import { ScheduledEmailStatus } from "@/generated/prisma/enums";

// Threads that already have a pending scheduled send (a follow-up chain the
// user set up). The chase nudge / waiting-on-others reminder defers to this:
// if the app is already auto-following-up on a thread, we don't also nag the
// user to chase it by hand.
export async function getThreadIdsWithActiveScheduledChain({
  emailAccountId,
  threadIds,
}: {
  emailAccountId: string;
  threadIds: string[];
}): Promise<Set<string>> {
  const ids = threadIds.filter(Boolean);
  if (ids.length === 0) return new Set();

  const rows = await prisma.scheduledEmail.findMany({
    where: {
      emailAccountId,
      status: ScheduledEmailStatus.PENDING,
      threadId: { in: ids },
    },
    select: { threadId: true },
  });

  const active = new Set<string>();
  for (const row of rows) {
    if (row.threadId) active.add(row.threadId);
  }
  return active;
}
