import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { TriageTier } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { extractNameFromEmail } from "@/utils/email";
import { checkHasAccess } from "@/utils/premium/server";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { sendDigest } from "@/utils/digest/send-digest";
import { generateCatchupBriefing } from "@/utils/ai/catchup/generate-catchup-briefing";
import {
  getStoredTriageByMessageId,
  type StoredTriage,
} from "@/utils/ai/catchup/stored-triage";
import { catchupQuerySchema, parseSince } from "./validation";

export const maxDuration = 120;

// Default and hard cap on how many unread emails a single catch-up scans.
const DEFAULT_LIMIT = 50;
const PAGE_SIZE = 50;

const TIER_ORDER: TriageTier[] = [
  TriageTier.URGENT,
  TriageTier.IMPORTANT,
  TriageTier.FYI,
];

const TIER_SECTION_NAMES: Record<TriageTier, string> = {
  [TriageTier.URGENT]: "🔴 Urgent",
  [TriageTier.IMPORTANT]: "🟡 Important",
  [TriageTier.FYI]: "⚪ FYI",
};

type CatchupItem = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  tier: TriageTier;
  reason: string;
};

// GET /api/devaicon/catchup?since={iso|epochMs}&limit=&deliver=
// Ranked "what you missed" briefing: fetches unread mail since a timestamp,
// triages it into priority tiers with one-line reasons, and writes an overall
// urgency-first summary. Optionally delivers via the account's digest channels.
export const GET = withEmailProvider("devaicon/catchup", async (request) => {
  const { emailProvider } = request;
  const { emailAccountId, email: userEmail } = request.auth;
  const logger = request.logger;

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = catchupQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const since = parseSince(parsed.data.since);
  if (!since) {
    return NextResponse.json(
      { error: "`since` must be an ISO 8601 date or epoch milliseconds" },
      { status: 400 },
    );
  }

  const hasAccess = await checkHasAccess({
    userId: request.auth.userId,
    minimumTier: "PLUS_MONTHLY",
  });
  if (!hasAccess) {
    return NextResponse.json(
      { error: "Catch-up briefings require an active plan" },
      { status: 403 },
    );
  }

  const limit = parsed.data.limit ?? DEFAULT_LIMIT;

  const messages = await fetchUnreadSince({
    emailProvider,
    since,
    limit,
  });

  if (messages.length === 0) {
    return NextResponse.json({
      since: since.toISOString(),
      count: 0,
      summary: "No unread emails since then — you're all caught up.",
      tiers: emptyTiers(),
    });
  }

  const emailAccount = await getEmailAccountWithAi({ emailAccountId });
  if (!emailAccount) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  // Reuse the priority tier already assigned to these emails by rules so the
  // catch-up agrees with the rest of the app and only untiered mail is judged.
  const storedTriage = await getStoredTriageByMessageId({
    emailAccountId,
    messageIds: messages.map((message) => message.id),
  });

  const briefing = await generateCatchupBriefing({
    emailAccount,
    emails: messages.map((message) => ({
      email: getEmailForLLM(message),
      knownTriage: storedTriage.get(message.id),
    })),
    logger,
  });

  if (!briefing) {
    return NextResponse.json(
      { error: "Failed to generate catch-up briefing" },
      { status: 500 },
    );
  }

  const items = rankItems({ briefing, messages, storedTriage });
  const tiers = groupByTier(items);

  if (parsed.data.deliver) {
    await deliverCatchup({
      emailAccountId,
      userEmail,
      summary: briefing.summary,
      tiers,
      logger,
    }).catch((error) => {
      logger.error("Failed to deliver catch-up briefing", { error });
    });
  }

  return NextResponse.json({
    since: since.toISOString(),
    count: items.length,
    summary: briefing.summary,
    tiers,
  });
});

async function fetchUnreadSince({
  emailProvider,
  since,
  limit,
}: {
  emailProvider: EmailProvider;
  since: Date;
  limit: number;
}): Promise<ParsedMessage[]> {
  const collected: ParsedMessage[] = [];
  let pageToken: string | undefined;

  do {
    const { messages, nextPageToken } =
      await emailProvider.getMessagesWithPagination({
        after: since,
        unreadOnly: true,
        inboxOnly: true,
        maxResults: Math.min(PAGE_SIZE, limit - collected.length),
        pageToken,
      });
    collected.push(...messages);
    pageToken = nextPageToken;
  } while (pageToken && collected.length < limit);

  return collected.slice(0, limit);
}

function rankItems({
  briefing,
  messages,
  storedTriage,
}: {
  briefing: NonNullable<Awaited<ReturnType<typeof generateCatchupBriefing>>>;
  messages: ParsedMessage[];
  storedTriage: Map<string, StoredTriage>;
}): CatchupItem[] {
  const tierByIndex = new Map(briefing.items.map((item) => [item.index, item]));

  const items: CatchupItem[] = messages.map((message, index) => {
    // Stored tier is authoritative; the model only triaged untiered emails.
    const stored = storedTriage.get(message.id);
    const triaged = tierByIndex.get(index);
    return {
      messageId: message.id,
      threadId: message.threadId,
      from: extractNameFromEmail(message.headers.from) || message.headers.from,
      subject: message.headers.subject || "(no subject)",
      // Stored → model → default to IMPORTANT if both are somehow missing.
      tier: stored?.tier ?? triaged?.tier ?? TriageTier.IMPORTANT,
      reason: stored?.reason || triaged?.reason || "",
    };
  });

  return items.sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
  );
}

function groupByTier(items: CatchupItem[]): Record<TriageTier, CatchupItem[]> {
  const grouped = emptyTiers();
  for (const item of items) grouped[item.tier].push(item);
  return grouped;
}

function emptyTiers(): Record<TriageTier, CatchupItem[]> {
  return {
    [TriageTier.URGENT]: [],
    [TriageTier.IMPORTANT]: [],
    [TriageTier.FYI]: [],
  };
}

async function deliverCatchup({
  emailAccountId,
  userEmail,
  summary,
  tiers,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  summary: string;
  tiers: Record<TriageTier, CatchupItem[]>;
  logger: Logger;
}) {
  const ruleNames: Record<string, string> = {};
  const itemsByRule: Record<
    string,
    { from: string; subject: string; content: string }[]
  > = {};

  if (summary) {
    const key = "catchupSummary";
    ruleNames[key] = "🗒️ What you missed";
    itemsByRule[key] = [{ from: "", subject: "Summary", content: summary }];
  }

  for (const tier of TIER_ORDER) {
    const tierItems = tiers[tier];
    if (tierItems.length === 0) continue;
    const key = `catchup${tier}`;
    ruleNames[key] = TIER_SECTION_NAMES[tier];
    itemsByRule[key] = tierItems.map((item) => ({
      from: item.from,
      subject: item.subject,
      content: item.reason,
    }));
  }

  const unsubscribeToken = await createUnsubscribeToken({ emailAccountId });

  await sendDigest({
    emailAccountId,
    userEmail,
    unsubscribeToken,
    date: new Date(),
    ruleNames,
    itemsByRule,
    logger,
  });
}
