import prisma from "@/utils/prisma";
import type { TriageTier } from "@/generated/prisma/enums";

export type StoredTriage = { tier: TriageTier; reason: string };

// Reuses the priority tier already assigned when an email was processed by
// rules, so the catch-up briefing agrees with the rest of the app instead of
// re-judging the same email. Returns the most recent tier per message.
export async function getStoredTriageByMessageId({
  emailAccountId,
  messageIds,
}: {
  emailAccountId: string;
  messageIds: string[];
}): Promise<Map<string, StoredTriage>> {
  if (messageIds.length === 0) return new Map();

  const rows = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      messageId: { in: messageIds },
      triageTier: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { messageId: true, triageTier: true, triageReason: true },
  });

  const byMessageId = new Map<string, StoredTriage>();
  for (const row of rows) {
    if (!row.triageTier) continue;
    // Rows are newest-first; keep the first (latest) seen per message.
    if (byMessageId.has(row.messageId)) continue;
    byMessageId.set(row.messageId, {
      tier: row.triageTier,
      reason: row.triageReason ?? "",
    });
  }

  return byMessageId;
}
