import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import { isLikelySendOnlyAddress } from "@/utils/email/no-reply";

export const GROUP_RECIPIENT_LIMIT = 50;

// How many labelled threads to scan when collecting senders. A group only ever
// yields GROUP_RECIPIENT_LIMIT recipients, so scanning far past this buys
// latency and nothing else.
const LABEL_THREAD_SCAN_LIMIT = 100;

export type GroupRecipient = {
  email: string;
  name: string | null;
  source: "category" | "label";
};

/**
 * Resolves a group name typed in chat ("Marketing") into addresses that can
 * actually receive mail.
 *
 * Two independent sources, because the same word means two things in the
 * product: the sender categorisation behind the Bulk Archive screen, and the
 * mailbox label applied by rules. Both are searched and merged.
 */
export async function resolveGroupRecipients({
  emailAccountId,
  provider,
  group,
  includeNoReply = false,
  limit = GROUP_RECIPIENT_LIMIT,
  logger,
}: {
  emailAccountId: string;
  provider: EmailProvider;
  group: string;
  includeNoReply?: boolean;
  limit?: number;
  logger: Logger;
}) {
  const [fromCategory, fromLabel] = await Promise.all([
    getCategorySenders({ emailAccountId, group }),
    getLabelSenders({ provider, group, logger }),
  ]);

  const byAddress = new Map<string, GroupRecipient>();
  // Category senders come first so they win on collision: they carry the
  // curated display name rather than whatever a header happened to say.
  for (const recipient of [...fromCategory.senders, ...fromLabel.senders]) {
    const address = recipient.email.trim().toLowerCase();
    if (!address) continue;
    if (!byAddress.has(address)) byAddress.set(address, recipient);
  }

  const deduped = [...byAddress.values()];
  const noReply = deduped.filter((r) => isLikelySendOnlyAddress(r.email));
  const reachable = includeNoReply
    ? deduped
    : deduped.filter((r) => !isLikelySendOnlyAddress(r.email));

  return {
    group,
    matchedCategory: fromCategory.categoryName,
    matchedLabel: fromLabel.labelName,
    recipients: reachable.slice(0, limit),
    excludedNoReply: includeNoReply ? [] : noReply.map((r) => r.email),
    totalFound: deduped.length,
    truncated: reachable.length > limit,
  };
}

async function getCategorySenders({
  emailAccountId,
  group,
}: {
  emailAccountId: string;
  group: string;
}) {
  const category = await prisma.category.findFirst({
    where: { emailAccountId, name: { equals: group, mode: "insensitive" } },
    select: {
      name: true,
      emailSenders: { select: { email: true, name: true } },
    },
  });

  if (!category) return { categoryName: null, senders: [] as GroupRecipient[] };

  return {
    categoryName: category.name,
    senders: category.emailSenders.map(
      (sender): GroupRecipient => ({
        email: extractEmailAddress(sender.email) || sender.email,
        name: sender.name ?? null,
        source: "category",
      }),
    ),
  };
}

async function getLabelSenders({
  provider,
  group,
  logger,
}: {
  provider: EmailProvider;
  group: string;
  logger: Logger;
}) {
  try {
    const label = await provider.getLabelByName(group);
    if (!label?.id) return { labelName: null, senders: [] as GroupRecipient[] };

    const { threads } = await provider.getThreadsWithQuery({
      query: { labelId: label.id },
      maxResults: LABEL_THREAD_SCAN_LIMIT,
    });

    const senders: GroupRecipient[] = [];
    for (const thread of threads) {
      const from = thread.messages?.[0]?.headers?.from;
      if (!from) continue;

      const address = extractEmailAddress(from);
      if (!address) continue;

      senders.push({
        email: address,
        name: extractNameFromEmail(from) || null,
        source: "label",
      });
    }

    return { labelName: label.name ?? group, senders };
  } catch (error) {
    // A group may exist only as a category, so a missing or unreadable label is
    // an ordinary outcome rather than a failure.
    logger.warn("Could not read senders from label", { group, error });
    return { labelName: null, senders: [] as GroupRecipient[] };
  }
}
