import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  AWAITING_YOUR_REPLY_DIGEST_KEY,
  WAITING_ON_OTHERS_DIGEST_KEY,
  getReplyReminderDigestSections,
} from "./reply-reminders";

vi.mock("@/utils/prisma");

const logger = createScopedLogger("reply-reminders-test");

function tracker(overrides: Record<string, unknown>) {
  return {
    threadId: "t1",
    messageId: "m1",
    sentAt: new Date(),
    ...overrides,
  };
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    threadId: "t1",
    internalDate: new Date().toISOString(),
    snippet: "",
    headers: {
      from: "Alice <alice@example.com>",
      to: "Bob <bob@example.com>",
      subject: "Project update",
    },
    // biome-ignore lint/suspicious/noExplicitAny: partial message mock
    ...overrides,
  } as any;
}

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

describe("getReplyReminderDigestSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No active scheduled chains unless a test says otherwise.
    prisma.scheduledEmail.findMany.mockResolvedValue([]);
  });

  it("skips a section whose threshold is null", async () => {
    prisma.threadTracker.findMany.mockResolvedValue([]);
    const getMessagesBatch = vi.fn().mockResolvedValue([]);

    const result = await getReplyReminderDigestSections({
      emailAccountId: "ea1",
      timezone: "UTC",
      needsReplyDays: null,
      awaitingReplyDays: null,
      // biome-ignore lint/suspicious/noExplicitAny: partial provider mock
      provider: { getMessagesBatch } as any,
      now: new Date(),
      logger,
    });

    expect(prisma.threadTracker.findMany).not.toHaveBeenCalled();
    expect(getMessagesBatch).not.toHaveBeenCalled();
    expect(result.itemsByRule).toEqual({});
  });

  it("includes overdue NEEDS_REPLY items under the awaiting-your-reply section", async () => {
    prisma.threadTracker.findMany.mockResolvedValue([
      tracker({ messageId: "m1", sentAt: THIRTY_DAYS_AGO }),
    ] as any);
    const getMessagesBatch = vi.fn().mockResolvedValue([message()]);

    const result = await getReplyReminderDigestSections({
      emailAccountId: "ea1",
      timezone: "UTC",
      needsReplyDays: 3,
      awaitingReplyDays: null,
      // biome-ignore lint/suspicious/noExplicitAny: partial provider mock
      provider: { getMessagesBatch } as any,
      now: new Date(),
      logger,
    });

    const items = result.itemsByRule[AWAITING_YOUR_REPLY_DIGEST_KEY];
    expect(items).toHaveLength(1);
    // NEEDS_REPLY shows the sender (from).
    expect(items?.[0]).toMatchObject({
      from: "Alice",
      subject: "Project update",
    });
    expect(items?.[0].content).toContain("/ea1/reply-zero?tab=needsReply");
    expect(result.itemsByRule[WAITING_ON_OTHERS_DIGEST_KEY]).toBeUndefined();
  });

  it("uses the recipient for waiting-on-others and links to the awaiting tab", async () => {
    prisma.threadTracker.findMany.mockResolvedValue([
      tracker({ messageId: "m1", sentAt: THIRTY_DAYS_AGO }),
    ] as any);
    const getMessagesBatch = vi.fn().mockResolvedValue([message()]);

    const result = await getReplyReminderDigestSections({
      emailAccountId: "ea1",
      timezone: "UTC",
      needsReplyDays: null,
      awaitingReplyDays: 2,
      // biome-ignore lint/suspicious/noExplicitAny: partial provider mock
      provider: { getMessagesBatch } as any,
      now: new Date(),
      logger,
    });

    const items = result.itemsByRule[WAITING_ON_OTHERS_DIGEST_KEY];
    expect(items).toHaveLength(1);
    // AWAITING shows the recipient (to).
    expect(items?.[0]).toMatchObject({ from: "Bob" });
    expect(items?.[0].content).toContain("/ea1/reply-zero?tab=awaitingReply");
  });

  it("suppresses a waiting-on-others item when the thread has an active scheduled chain", async () => {
    prisma.threadTracker.findMany.mockResolvedValue([
      tracker({ threadId: "t1", messageId: "m1", sentAt: THIRTY_DAYS_AGO }),
    ] as any);
    // The app is already auto-chasing this thread.
    prisma.scheduledEmail.findMany.mockResolvedValue([
      { threadId: "t1" },
    ] as any);
    const getMessagesBatch = vi.fn().mockResolvedValue([message()]);

    const result = await getReplyReminderDigestSections({
      emailAccountId: "ea1",
      timezone: "UTC",
      needsReplyDays: null,
      awaitingReplyDays: 2,
      // biome-ignore lint/suspicious/noExplicitAny: partial provider mock
      provider: { getMessagesBatch } as any,
      now: new Date(),
      logger,
    });

    expect(result.itemsByRule).toEqual({});
    // No point fetching the message if it was suppressed.
    expect(getMessagesBatch).not.toHaveBeenCalled();
  });

  it("excludes items that are not yet overdue", async () => {
    prisma.threadTracker.findMany.mockResolvedValue([
      tracker({ messageId: "m1", sentAt: new Date() }),
    ] as any);
    const getMessagesBatch = vi.fn().mockResolvedValue([message()]);

    const result = await getReplyReminderDigestSections({
      emailAccountId: "ea1",
      timezone: "UTC",
      needsReplyDays: 3,
      awaitingReplyDays: null,
      // biome-ignore lint/suspicious/noExplicitAny: partial provider mock
      provider: { getMessagesBatch } as any,
      now: new Date(),
      logger,
    });

    expect(getMessagesBatch).not.toHaveBeenCalled();
    expect(result.itemsByRule).toEqual({});
  });

  it("returns no items when the provider message fetch fails", async () => {
    prisma.threadTracker.findMany.mockResolvedValue([
      tracker({ messageId: "m1", sentAt: THIRTY_DAYS_AGO }),
    ] as any);
    const getMessagesBatch = vi
      .fn()
      .mockRejectedValue(new Error("provider down"));

    const result = await getReplyReminderDigestSections({
      emailAccountId: "ea1",
      timezone: "UTC",
      needsReplyDays: 3,
      awaitingReplyDays: null,
      // biome-ignore lint/suspicious/noExplicitAny: partial provider mock
      provider: { getMessagesBatch } as any,
      now: new Date(),
      logger,
    });

    expect(result.itemsByRule).toEqual({});
  });
});
