import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { createEmailProvider } from "@/utils/email/provider";
import {
  cancelScheduledEmailTool,
  draftEmailTool,
  executeSenderWideInboxAction,
  forwardEmailTool,
  getAccountOverviewTool,
  rescheduleScheduledEmailTool,
  getSenderCategorizationStatusTool,
  getSenderCategoryOverviewTool,
  manageInboxTool,
  manageSenderCategoryTool,
  replyEmailTool,
  searchInboxTool,
  sendEmailTool,
  startSenderCategorizationTool,
} from "./chat-inbox-tools";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const { mockVerifyRecurrenceRequest, mockVerifyScheduledSendIntent } =
  vi.hoisted(() => ({
    mockVerifyRecurrenceRequest: vi.fn(),
    mockVerifyScheduledSendIntent: vi.fn(),
  }));

vi.mock("@/utils/ai/assistant/verify-recurrence-request", () => ({
  verifyRecurrenceRequest: (
    ...args: Parameters<typeof mockVerifyRecurrenceRequest>
  ) => mockVerifyRecurrenceRequest(...args),
  verifyScheduledSendIntent: (
    ...args: Parameters<typeof mockVerifyScheduledSendIntent>
  ) => mockVerifyScheduledSendIntent(...args),
}));

const {
  mockArchiveCategory,
  mockGetCategoryOverview,
  mockStartBulkCategorization,
  mockGetCategorizationProgress,
  mockGetCategorizationStatusSnapshot,
} = vi.hoisted(() => ({
  mockArchiveCategory: vi.fn(),
  mockGetCategoryOverview: vi.fn(),
  mockStartBulkCategorization: vi.fn(),
  mockGetCategorizationProgress: vi.fn(),
  mockGetCategorizationStatusSnapshot: vi.fn(),
}));

vi.mock("@/utils/categorize/senders/archive-category", () => ({
  archiveCategory: (...args: Parameters<typeof mockArchiveCategory>) =>
    mockArchiveCategory(...args),
}));

vi.mock("@/utils/categorize/senders/get-category-overview", () => ({
  getCategoryOverview: (...args: Parameters<typeof mockGetCategoryOverview>) =>
    mockGetCategoryOverview(...args),
}));

vi.mock("@/utils/categorize/senders/start-bulk-categorization", () => ({
  startBulkCategorization: (
    ...args: Parameters<typeof mockStartBulkCategorization>
  ) => mockStartBulkCategorization(...args),
}));

vi.mock("@/utils/redis/categorization-progress", () => ({
  getCategorizationProgress: (
    ...args: Parameters<typeof mockGetCategorizationProgress>
  ) => mockGetCategorizationProgress(...args),
  getCategorizationStatusSnapshot: (
    ...args: Parameters<typeof mockGetCategorizationStatusSnapshot>
  ) => mockGetCategorizationStatusSnapshot(...args),
}));

const TEST_EMAIL = "user@test.com";
const logger = createTestLogger();

describe("chat inbox tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Most tests aren't exercising the scheduling-intent guard itself, so
    // default to "verified" and let the guard's own tests override this.
    mockVerifyScheduledSendIntent.mockResolvedValue(true);
  });

  it("adds formatted from header when sending an email", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      actionType: "send_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        to: "recipient@example.com",
        subject: "Hello",
        messageHtml: "<p>Hi there</p>",
        from: `Test User <${TEST_EMAIL}>`,
      },
    });
  });

  it("carries sendAt into the pending action for scheduled sends", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      sendAt,
    });

    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({ sendAt }),
    });
  });

  it("defaults pendingAction.sendAt to null for immediate sends", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(result).toMatchObject({
      pendingAction: expect.objectContaining({ sendAt: null }),
    });
  });

  it("treats near-now sendAt as an immediate send", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      sendAt: new Date().toISOString(),
    });

    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({ sendAt: null }),
    });
  });

  it("appends the account's configured signature to composed emails", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
      signature: "<p>Best,<br>Dara</p>",
    } as any);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(result).toMatchObject({
      pendingAction: expect.objectContaining({
        messageHtml: "<p>Hi there</p><br><br><p>Best,<br>Dara</p>",
      }),
    });
  });

  it("carries supersedesDraftId into the pending action so the draft is cleaned up on confirm", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      supersedesDraftId: "draft-123",
    });

    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({
        supersedesDraftId: "draft-123",
      }),
    });
  });

  it("rejects sendEmail input when recipient has no email address", async () => {
    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "Jack Cohen",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(result).toEqual({
      error: "Invalid sendEmail input: to must include valid email address(es)",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("creates a mailbox draft when the user asks for a draft", async () => {
    const mockCreateDraft = vi.fn().mockResolvedValue({ id: "draft-123" });
    vi.mocked(createEmailProvider).mockResolvedValue({
      createDraft: mockCreateDraft,
    } as any);

    const toolInstance = draftEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      cc: "copy@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(mockCreateDraft).toHaveBeenCalledWith({
      to: "recipient@example.com",
      cc: "copy@example.com",
      bcc: undefined,
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      replyToMessageId: undefined,
    });
    expect(result).toEqual({
      success: true,
      draftId: "draft-123",
      to: "recipient@example.com",
      subject: "Hello",
    });
  });

  it("deletes the replaced draft after a rewrite saves the new one", async () => {
    const mockCreateDraft = vi.fn().mockResolvedValue({ id: "draft-456" });
    const mockDeleteDraft = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createEmailProvider).mockResolvedValue({
      createDraft: mockCreateDraft,
      deleteDraft: mockDeleteDraft,
    } as any);

    const toolInstance = draftEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Rewritten</p>",
      replacesDraftId: "draft-123",
    });

    expect(mockCreateDraft).toHaveBeenCalled();
    expect(mockDeleteDraft).toHaveBeenCalledWith("draft-123");
    expect(result).toMatchObject({
      success: true,
      draftId: "draft-456",
      replacedDraftId: "draft-123",
    });
  });

  it("rejects draftEmail input when recipient has no email address", async () => {
    const toolInstance = draftEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "Jack Cohen",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(result).toEqual({
      error:
        "Invalid draftEmail input: to must include valid email address(es)",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("keeps repeats when the quote matches the user's current message and the message actually requests recurrence", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);
    mockVerifyRecurrenceRequest.mockResolvedValue(true);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      conversationUserMessageTexts: [
        "Please remind her every 10 minutes, 3 times total, starting in an hour.",
      ],
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      sendAt,
      repeatEveryMinutes: 10,
      repeatCount: 3,
      repeatRequestQuote: "every 10 minutes, 3 times total",
    });

    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({
        sendAt,
        repeatEveryMinutes: 10,
        repeatCount: 3,
      }),
    });
  });

  it("keeps repeats requested in an earlier message of the conversation", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);
    mockVerifyRecurrenceRequest.mockResolvedValue(true);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      // The recurrence was requested two messages ago; the latest message
      // only refers back to it.
      conversationUserMessageTexts: [
        "send 5 chained messages separated by 1 min saying i miss you",
        "do all of this for darabodla@gmail.com",
      ],
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      to: "darabodla@gmail.com",
      subject: "I miss you",
      messageHtml: "<p>I miss you.</p>",
      sendAt,
      repeatEveryMinutes: 1,
      repeatCount: 5,
      repeatRequestQuote: "5 chained messages separated by 1 min",
    });

    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({
        sendAt,
        repeatEveryMinutes: 1,
        repeatCount: 5,
      }),
    });
  });

  it("carries cancelIfRecipientReplies into the pending action", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);
    mockVerifyScheduledSendIntent.mockResolvedValue(true);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      conversationUserMessageTexts: [
        "send it in an hour and cancel if he replies",
      ],
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      sendAt,
      cancelIfRecipientReplies: true,
    });

    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({
        sendAt,
        cancelOnReply: true,
      }),
    });
  });

  it("strips repeats when the quote is a real but unrelated fragment (e.g. a one-time send time)", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);
    // The quote is a verbatim substring of the message, but doesn't itself
    // request recurrence — this is exactly the loophole a model can exploit.
    mockVerifyRecurrenceRequest.mockResolvedValue(false);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      conversationUserMessageTexts: ["Schedule this for tomorrow 9am"],
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      sendAt,
      repeatEveryMinutes: 1,
      repeatCount: 2,
      repeatRequestQuote: "tomorrow 9am",
    });

    expect(mockVerifyRecurrenceRequest).toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({
        sendAt,
        repeatEveryMinutes: null,
        repeatCount: null,
      }),
    });
  });

  it("keeps sendAt when verification confirms the message asked to schedule this email", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);
    mockVerifyScheduledSendIntent.mockResolvedValue(true);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      conversationUserMessageTexts: ["Schedule this for tomorrow 9am"],
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Follow up",
      messageHtml: "<p>Following up</p>",
      sendAt,
    });

    expect(mockVerifyScheduledSendIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        emailSubject: "Follow up",
        emailContentSnippet: "<p>Following up</p>",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({ sendAt }),
    });
  });

  it("strips sendAt when verification says this specific email wasn't meant to be scheduled", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);
    // Reproduces the model copying a sibling email's sendAt onto this one
    // even though the message said this one should send now.
    mockVerifyScheduledSendIntent.mockResolvedValue(false);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      conversationUserMessageTexts: [
        "Send now: Subject: Quick check-in. Schedule for tomorrow 9am: Subject: Follow up.",
      ],
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Quick check-in",
      messageHtml: "<p>Hey there</p>",
      sendAt,
    });

    expect(mockVerifyScheduledSendIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        emailSubject: "Quick check-in",
        emailContentSnippet: "<p>Hey there</p>",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({ sendAt: null }),
    });
  });

  it("strips repeats when the quote is not in the user's current message", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      conversationUserMessageTexts: [
        "send a scheduled email saying miss you in 2 mins",
      ],
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      sendAt,
      repeatEveryMinutes: 1,
      repeatCount: 2,
      repeatRequestQuote: "remind them every minute",
    });

    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({
        sendAt,
        repeatEveryMinutes: null,
        repeatCount: null,
      }),
    });
  });

  it("strips repeats when no quote is provided", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      conversationUserMessageTexts: ["remind her every 5 minutes, 4 times"],
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      sendAt,
      repeatEveryMinutes: 5,
      repeatCount: 4,
    });

    expect(result).toMatchObject({
      success: true,
      pendingAction: expect.objectContaining({
        repeatEveryMinutes: null,
        repeatCount: null,
      }),
    });
  });

  it("carries sendAt into the pending reply action", async () => {
    const getMessage = vi.fn().mockResolvedValue({
      id: "msg-1",
      threadId: "thread-1",
      headers: {
        from: "sender@example.com",
        subject: "Original subject",
        "message-id": "<abc@mail.example.com>",
      },
      subject: "Original subject",
    });
    vi.mocked(createEmailProvider).mockResolvedValue({ getMessage } as any);

    const toolInstance = replyEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      messageId: "msg-1",
      content: "Just following up!",
      sendAt,
    });

    expect(result).toMatchObject({
      success: true,
      actionType: "reply_email",
      pendingAction: expect.objectContaining({
        messageId: "msg-1",
        sendAt,
      }),
      reference: expect.objectContaining({ threadId: "thread-1" }),
    });
  });

  it("cancels the whole chain for a pending scheduled email by id", async () => {
    prisma.scheduledEmail.findFirst.mockResolvedValue({
      id: "sched-1",
      chainRootId: null,
      repeatEveryMinutes: null,
    } as any);
    prisma.scheduledEmail.updateMany
      .mockResolvedValueOnce({ count: 0 }) // no in-flight rows to flag
      .mockResolvedValueOnce({ count: 1 });

    const toolInstance = cancelScheduledEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await (toolInstance.execute as any)({ id: "sched-1" });

    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-1",
        status: "PENDING",
        OR: [{ id: "sched-1" }, { id: "sched-1" }, { chainRootId: "sched-1" }],
      },
      data: { status: "CANCELLED" },
    });
    expect(result).toEqual({
      success: true,
      id: "sched-1",
      cancelledCount: 1,
      inFlightCount: 0,
    });
  });

  it("reports an in-flight occurrence honestly instead of claiming it was stopped", async () => {
    prisma.scheduledEmail.findFirst.mockResolvedValue({
      id: "sched-1",
      chainRootId: null,
      repeatEveryMinutes: 5,
    } as any);
    prisma.scheduledEmail.updateMany
      .mockResolvedValueOnce({ count: 1 }) // SENDING row flagged
      .mockResolvedValueOnce({ count: 0 }); // nothing left pending

    const toolInstance = cancelScheduledEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await (toolInstance.execute as any)({ id: "sched-1" });

    expect(result).toMatchObject({
      success: true,
      cancelledCount: 0,
      inFlightCount: 1,
      note: expect.stringContaining("mid-send"),
    });
  });

  it("returns an error when cancelling a scheduled email that is not pending", async () => {
    prisma.scheduledEmail.findFirst.mockResolvedValue(null);

    const toolInstance = cancelScheduledEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await (toolInstance.execute as any)({ id: "sched-gone" });

    expect(result).toEqual({
      error:
        "Scheduled email not found. Use listScheduledEmails to see the current queue.",
    });
  });

  it("rejects rescheduling a scheduled email to a near-now time", async () => {
    const toolInstance = rescheduleScheduledEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      id: "sched-1",
      sendAt: new Date().toISOString(),
    });

    expect(prisma.scheduledEmail.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      error:
        "sendAt must be at least a minute in the future. Recompute it from the current time in context and try again.",
    });
  });

  it("reschedules a pending scheduled email to a future time", async () => {
    prisma.scheduledEmail.findFirst.mockResolvedValue({
      id: "sched-1",
      chainRootId: null,
    } as any);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });

    const toolInstance = rescheduleScheduledEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await (toolInstance.execute as any)({
      id: "sched-1",
      sendAt,
    });

    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-1",
        status: "PENDING",
        OR: [{ id: "sched-1" }, { id: "sched-1" }, { chainRootId: "sched-1" }],
      },
      data: { sendAt: new Date(sendAt) },
    });
    expect(result).toEqual({
      success: true,
      id: "sched-1",
      sendAt,
      rescheduledCount: 1,
    });
  });

  it("reschedules the chain's current occurrence from a stale occurrence id", async () => {
    prisma.scheduledEmail.findFirst.mockResolvedValue({
      id: "sched-2",
      chainRootId: "sched-1",
    } as any);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });

    const toolInstance = rescheduleScheduledEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await (toolInstance.execute as any)({ id: "sched-2", sendAt });

    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-1",
        status: "PENDING",
        OR: [{ id: "sched-2" }, { id: "sched-1" }, { chainRootId: "sched-1" }],
      },
      data: { sendAt: new Date(sendAt) },
    });
  });

  it("returns an error when draft creation fails", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      createDraft: vi.fn().mockRejectedValue(new Error("provider down")),
    } as any);

    const toolInstance = draftEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(result).toEqual({ error: "Failed to create draft" });
  });

  it("prepares threaded reply flow without sending immediately", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const message: ParsedMessage = {
      id: "message-1",
      threadId: "thread-1",
      snippet: "",
      historyId: "",
      inline: [],
      headers: {
        from: "contact@example.com",
        to: TEST_EMAIL,
        subject: "Question",
        date: "2026-02-18T00:00:00.000Z",
      },
      subject: "Question",
      date: "2026-02-18T00:00:00.000Z",
    };

    const getMessage = vi.fn().mockResolvedValue(message);
    const replyToEmail = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage,
      replyToEmail,
    } as any);

    const toolInstance = replyEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      messageId: "message-1",
      content: "Thanks for the update.",
    });

    expect(getMessage).toHaveBeenCalledWith("message-1");
    expect(replyToEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      actionType: "reply_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        messageId: "message-1",
        content: "Thanks for the update.",
      },
      reference: {
        messageId: "message-1",
        threadId: "thread-1",
      },
    });
  });

  it("prepares forward flow without sending immediately", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const message: ParsedMessage = {
      id: "message-1",
      threadId: "thread-1",
      snippet: "",
      historyId: "",
      inline: [],
      headers: {
        from: "contact@example.com",
        to: TEST_EMAIL,
        subject: "Question",
        date: "2026-02-18T00:00:00.000Z",
      },
      subject: "Question",
      date: "2026-02-18T00:00:00.000Z",
    };

    const getMessage = vi.fn().mockResolvedValue(message);
    const forwardEmail = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage,
      forwardEmail,
    } as any);

    const toolInstance = forwardEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      messageId: "message-1",
      to: "recipient@example.com",
      content: "Forwarding this along.",
    });

    expect(getMessage).toHaveBeenCalledWith("message-1");
    expect(forwardEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      actionType: "forward_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        messageId: "message-1",
        to: "recipient@example.com",
        content: "Forwarding this along.",
      },
      reference: {
        messageId: "message-1",
        threadId: "thread-1",
      },
    });
  });

  it("rejects forwardEmail input when recipient has no email address", async () => {
    const toolInstance = forwardEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      messageId: "message-1",
      to: "Jack Cohen",
      content: "Forwarding this along.",
    });

    expect(result).toEqual({
      error:
        "Invalid forwardEmail input: to must include valid email address(es)",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("resolves a label name before archiving threads", async () => {
    const archiveThreadWithLabel = vi.fn().mockResolvedValue(undefined);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "To-Delete",
      type: "user",
    });

    vi.mocked(createEmailProvider).mockResolvedValue({
      archiveThreadWithLabel,
      getLabelByName,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "archive_threads",
      label: "To-Delete",
      threadIds: ["thread-1", "thread-2"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("To-Delete");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(archiveThreadWithLabel).toHaveBeenNthCalledWith(
      1,
      "thread-1",
      TEST_EMAIL,
      "Label_123",
    );
    expect(archiveThreadWithLabel).toHaveBeenNthCalledWith(
      2,
      "thread-2",
      TEST_EMAIL,
      "Label_123",
    );
    expect(result).toMatchObject({
      action: "archive_threads",
      success: true,
      failedCount: 0,
      successCount: 2,
      requestedCount: 2,
    });
  });

  it("resolves an exact labelName to the provider label before labeling threads", async () => {
    const getThreadMessages = vi.fn().mockImplementation(async (threadId) => [
      {
        id: `${threadId}-message-1`,
        threadId,
      },
      {
        id: `${threadId}-message-2`,
        threadId,
      },
    ]);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    const labelMessage = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1", "thread-2"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(getThreadMessages).toHaveBeenNthCalledWith(1, "thread-1");
    expect(getThreadMessages).toHaveBeenNthCalledWith(2, "thread-2");
    expect(labelMessage).toHaveBeenCalledTimes(4);
    expect(labelMessage.mock.calls).toEqual(
      expect.arrayContaining([
        [
          {
            messageId: "thread-1-message-1",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
        [
          {
            messageId: "thread-1-message-2",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
        [
          {
            messageId: "thread-2-message-1",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
        [
          {
            messageId: "thread-2-message-2",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
      ]),
    );
    expect(result).toMatchObject({
      action: "label_threads",
      success: true,
      failedCount: 0,
      successCount: 2,
      requestedCount: 2,
      labelId: "Label_123",
      labelName: "Finance",
    });
  });

  it("throttles Gmail label_threads writes to small batches", async () => {
    const getThreadMessages = vi.fn().mockImplementation(async (threadId) => [
      {
        id: `${threadId}-message-1`,
        threadId,
      },
      {
        id: `${threadId}-message-2`,
        threadId,
      },
    ]);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    let inFlight = 0;
    let maxInFlight = 0;
    const labelMessage = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return {};
    });

    vi.mocked(createEmailProvider).mockResolvedValue({
      name: "google",
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1", "thread-2", "thread-3"],
    });

    expect(result).toMatchObject({
      action: "label_threads",
      success: true,
      failedCount: 0,
      successCount: 3,
      requestedCount: 3,
    });
    expect(labelMessage).toHaveBeenCalledTimes(6);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("returns a descriptive error when label_threads receives an unknown labelName", async () => {
    const getThreadMessages = vi.fn();
    const getLabelByName = vi.fn().mockResolvedValue(null);
    const labelMessage = vi.fn();

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(result).toEqual({
      error:
        'Label "Finance" does not exist. Use createOrGetLabel first if you want to create it.',
      toolErrorVisibility: "hidden",
    });
    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(getThreadMessages).not.toHaveBeenCalled();
    expect(labelMessage).not.toHaveBeenCalled();
  });

  it("resolves an exact labelName before removing labels from threads", async () => {
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    const removeThreadLabel = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabelByName,
      removeThreadLabel,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "remove_label_threads",
      labelName: "Finance",
      threadIds: ["thread-1", "thread-2"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(removeThreadLabel).toHaveBeenNthCalledWith(
      1,
      "thread-1",
      "Label_123",
    );
    expect(removeThreadLabel).toHaveBeenNthCalledWith(
      2,
      "thread-2",
      "Label_123",
    );
    expect(result).toMatchObject({
      action: "remove_label_threads",
      success: true,
      failedCount: 0,
      successCount: 2,
      requestedCount: 2,
      labelId: "Label_123",
      labelName: "Finance",
    });
  });

  it("returns a transparent error when removing a label that does not exist", async () => {
    const getLabelByName = vi.fn().mockResolvedValue(null);
    const removeThreadLabel = vi.fn();

    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabelByName,
      removeThreadLabel,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "remove_label_threads",
      labelName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(result).toEqual({
      error: 'Label "Finance" does not exist, so no label was removed.',
      toolErrorVisibility: "hidden",
    });
    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(removeThreadLabel).not.toHaveBeenCalled();
  });

  it("removes Outlook categories using category wording in the tool contract", async () => {
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "category-123",
      name: "Finance",
      type: "user",
    });
    const removeThreadLabel = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabelByName,
      removeThreadLabel,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "remove_category_threads",
      categoryName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(removeThreadLabel).toHaveBeenCalledWith("thread-1", "category-123");
    expect(result).toMatchObject({
      action: "remove_category_threads",
      success: true,
      categoryId: "category-123",
      categoryName: "Finance",
    });
  });

  it("returns a pending confirmation for sender-wide cleanup instead of executing", async () => {
    const bulkArchiveFromSenders = vi.fn();
    vi.mocked(createEmailProvider).mockResolvedValue({
      bulkArchiveFromSenders,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "bulk_archive_senders",
      fromEmails: ["Promo <promo@shop.example>", "news@letters.example"],
    });

    expect(result).toEqual({
      success: true,
      actionType: "manage_inbox_senders",
      requiresConfirmation: true,
      confirmationState: "pending",
      action: "bulk_archive_senders",
      senders: ["promo@shop.example", "news@letters.example"],
      sendersCount: 2,
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(bulkArchiveFromSenders).not.toHaveBeenCalled();
  });

  it("executes a confirmed sender-wide bulk archive", async () => {
    const bulkArchiveFromSenders = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createEmailProvider).mockResolvedValue({
      bulkArchiveFromSenders,
    } as any);

    const result = await executeSenderWideInboxAction({
      emailAccountId: "email-account-1",
      provider: "google",
      userEmail: TEST_EMAIL,
      logger,
      action: "bulk_archive_senders",
      fromEmails: ["promo@shop.example"],
    });

    expect(bulkArchiveFromSenders).toHaveBeenCalledWith(
      ["promo@shop.example"],
      TEST_EMAIL,
      "email-account-1",
    );
    expect(result).toEqual({
      success: true,
      action: "bulk_archive_senders",
      sendersCount: 1,
      senders: ["promo@shop.example"],
    });
  });

  it("marks a thread labeling action as failed when any message label call fails", async () => {
    const getThreadMessages = vi.fn().mockResolvedValue([
      { id: "thread-1-message-1", threadId: "thread-1" },
      { id: "thread-1-message-2", threadId: "thread-1" },
    ]);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    const labelMessage = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("label failed"));

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(result).toMatchObject({
      action: "label_threads",
      success: false,
      failedCount: 1,
      successCount: 0,
      requestedCount: 1,
      failedThreadIds: ["thread-1"],
    });
  });
});

function serializeToolContract(toolInstance: {
  description?: string;
  inputSchema?: unknown;
}) {
  return [
    toolInstance.description,
    ...collectSchemaDescriptions(toolInstance.inputSchema),
  ]
    .filter(Boolean)
    .join("\n");
}

function collectSchemaDescriptions(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];

  const schemaObject = schema as {
    description?: string;
    def?: {
      shape?: Record<string, unknown>;
      innerType?: unknown;
      element?: unknown;
      in?: unknown;
      out?: unknown;
      options?: unknown[];
    };
  };
  const descriptions = schemaObject.description
    ? [schemaObject.description]
    : [];
  const def = schemaObject.def;

  if (def?.shape) {
    for (const value of Object.values(def.shape)) {
      descriptions.push(...collectSchemaDescriptions(value));
    }
  }

  for (const value of [def?.innerType, def?.element, def?.in, def?.out]) {
    descriptions.push(...collectSchemaDescriptions(value));
  }

  for (const option of def?.options ?? []) {
    descriptions.push(...collectSchemaDescriptions(option));
  }

  return descriptions;
}

describe("chat inbox tools - bulk pagination guidance (INB-134)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searchInbox result signals when more pages remain (hasMore)", async () => {
    (createEmailProvider as any).mockResolvedValue({
      searchMessages: vi.fn().mockResolvedValue({
        messages: [
          {
            id: "m1",
            threadId: "t1",
            snippet: "",
            historyId: "",
            inline: [],
            headers: {
              from: "a@b.com",
              to: TEST_EMAIL,
              subject: "hi",
              date: "2026-01-01T00:00:00.000Z",
            },
            subject: "hi",
            textPlain: "",
            textHtml: "",
            labelIds: [],
            internalDate: "0",
          },
        ],
        nextPageToken: "PAGE_TOKEN_2",
      }),
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "older_than:3y is:unread",
      limit: 20,
    });

    expect(result.nextPageToken).toBe("PAGE_TOKEN_2");
    expect(result.hasMore).toBe(true);
  });

  it("searchInbox uses the capped default page size when limit is omitted", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [
        {
          id: "m1",
          threadId: "t1",
          snippet: "",
          historyId: "",
          inline: [],
          headers: {
            from: "a@b.com",
            to: TEST_EMAIL,
            subject: "hi",
            date: "2026-01-01T00:00:00.000Z",
          },
          subject: "hi",
          textPlain: "",
          textHtml: "",
          labelIds: [],
          internalDate: "0",
        },
      ],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "older_than:3y is:unread",
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "older_than:3y is:unread",
      maxResults: 20,
      pageToken: undefined,
    });
  });

  it("searchInbox result reports hasMore=false when no more pages", async () => {
    (createEmailProvider as any).mockResolvedValue({
      searchMessages: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "older_than:10y",
      limit: 20,
    });

    expect(result.hasMore).toBe(false);
  });

  it("searchInbox retries Microsoft fielded sender searches with a plain-text fallback", async () => {
    const searchMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error("Search syntax failed"))
      .mockResolvedValueOnce({
        messages: [
          {
            id: "m1",
            threadId: "t1",
            externalUrl:
              "https://outlook.office.com/mail/deeplink/read/m1?ispopout=0",
            snippet: "Can you take a look?",
            historyId: "",
            inline: [],
            headers: {
              from: "sender@example.com",
              to: TEST_EMAIL,
              subject: "Review request",
              date: "2026-01-01T00:00:00.000Z",
            },
            subject: "Review request",
            textPlain: "",
            textHtml: "",
            labelIds: [],
            internalDate: "0",
          },
        ],
        nextPageToken: undefined,
      });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "from:sender@example.com",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "from:sender@example.com",
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: undefined,
    });
    expect(searchMessages).toHaveBeenNthCalledWith(2, {
      query: '"sender@example.com"',
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: undefined,
    });
    expect(result.messages).toHaveLength(1);
    expect(result.queryUsed).toBe('"sender@example.com"');
    expect(result.messages[0].externalUrl).toBe(
      "https://outlook.office.com/mail/deeplink/read/m1?ispopout=0",
    );
  });

  it("searchInbox passes structured Outlook category and read-state filters", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "",
      categoryName: "Newsletter",
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: "Newsletter",
    });
  });

  it("uses Outlook category wording in model-visible inbox tool contracts", () => {
    const toolOptions = {
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    };

    const contractText = [
      getAccountOverviewTool(toolOptions),
      searchInboxTool(toolOptions),
      manageInboxTool(toolOptions),
    ]
      .map(serializeToolContract)
      .join("\n");

    expect(contractText).toMatch(/\bcategory\b/i);
    expect(contractText).not.toMatch(/\blabels?\b/i);
  });

  it("searchInbox normalizes simple Outlook scope queries before provider search", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "Operations folder unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: "Operations",
    });
  });

  it("searchInbox removes redundant Outlook read-state terms before scope normalization", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "newsletter unread",
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: "newsletter",
    });
  });

  it("searchInbox normalizes Outlook folder field queries before provider search", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    await (toolInstance.execute as any)({
      query: 'folder:"Operations"',
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: "Operations",
    });
  });

  it("searchInbox advances through empty Outlook filtered pages", async () => {
    const message: ParsedMessage = {
      id: "message-1",
      threadId: "thread-1",
      snippet: "A scoped update",
      historyId: "",
      inline: [],
      headers: {
        from: "updates@example.com",
        to: TEST_EMAIL,
        subject: "Scoped update",
        date: "2026-02-18T00:00:00.000Z",
      },
      subject: "Scoped update",
      date: "2026-02-18T00:00:00.000Z",
      labelIds: ["UNREAD", "Operations"],
    };
    const searchMessages = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: "PAGE_TOKEN_2",
      })
      .mockResolvedValueOnce({
        messages: [message],
        nextPageToken: undefined,
      });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "",
      categoryName: "Operations",
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: "Operations",
    });
    expect(searchMessages).toHaveBeenNthCalledWith(2, {
      query: "",
      maxResults: 20,
      pageToken: "PAGE_TOKEN_2",
      readState: "unread",
      labelName: "Operations",
    });
    expect(result.messages).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it("searchInbox falls back to Outlook text search when a normalized scope is conclusively empty", async () => {
    const searchMessages = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: undefined,
      })
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: undefined,
      });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "invoice",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: "invoice",
    });
    expect(searchMessages).toHaveBeenNthCalledWith(2, {
      query: "invoice",
      maxResults: 20,
      readState: undefined,
    });
    expect(result.queryUsed).toBe("invoice");
  });

  it("searchInbox falls back to Outlook text search after empty structured pages end", async () => {
    const searchMessages = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: "PAGE_TOKEN_2",
      })
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: undefined,
      })
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: undefined,
      });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "invoice",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: "invoice",
    });
    expect(searchMessages).toHaveBeenNthCalledWith(2, {
      query: "",
      maxResults: 20,
      pageToken: "PAGE_TOKEN_2",
      readState: undefined,
      labelName: "invoice",
    });
    expect(searchMessages).toHaveBeenNthCalledWith(3, {
      query: "invoice",
      maxResults: 20,
      readState: undefined,
    });
    expect(result.queryUsed).toBe("invoice");
  });

  it("searchInbox does not pass structured Outlook filters to Google", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "newsletter",
      labelName: "Newsletter",
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "newsletter",
      maxResults: 20,
      pageToken: undefined,
    });
  });

  it("searchInbox returns structured Microsoft failure feedback when every attempt fails", async () => {
    const searchMessages = vi.fn().mockRejectedValue(
      Object.assign(new Error("Unsupported search clause"), {
        statusCode: 400,
        code: "BadRequest",
      }),
    );

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "from:sender@example.com",
      limit: 20,
    });

    expect(result).toMatchObject({
      queryUsed: "from:sender@example.com",
      error: "Failed to search inbox",
      provider: "microsoft",
      microsoftSearchFeedback: {
        failureType: "query_failed",
        summary:
          "Outlook did not return results for the attempted search query. Retry with one simpler Outlook clause at a time.",
        fallbackAttempted: true,
        likelyCause: "Retry with one simpler Outlook clause at a time.",
        removedTerms: [],
        retryQueries: [],
      },
    });
    expect(result.microsoftSearchFeedback.attempts).toEqual([
      {
        query: "from:sender@example.com",
        status: 400,
        code: "BadRequest",
        message: "Unsupported search clause",
      },
      {
        query: '"sender@example.com"',
        status: 400,
        code: "BadRequest",
        message: "Unsupported search clause",
      },
      {
        query: "sender@example.com",
        status: 400,
        code: "BadRequest",
        message: "Unsupported search clause",
      },
    ]);
    expect(searchMessages).toHaveBeenCalledTimes(3);
  });

  it("searchInbox suggests concrete simpler retries for complex Microsoft queries", async () => {
    const searchMessages = vi.fn().mockRejectedValue(
      Object.assign(new Error("Unsupported search clause"), {
        statusCode: 400,
        code: "BadRequest",
      }),
    );

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: 'unread sender@example.com subject:"weekly site report"',
      limit: 20,
    });

    expect(result.microsoftSearchFeedback).toMatchObject({
      failureType: "query_failed",
      likelyCause:
        "The failed query mixed a read-state term with other filters. Retry with one simpler clause.",
      removedTerms: ["unread"],
      retryQueries: ['subject:"weekly site report"', '"weekly site report"'],
    });
    expect(searchMessages).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        query: "sender@example.com",
      }),
    );
  });

  it("searchInbox preserves backslashes when generating Microsoft keyword retry queries", async () => {
    const searchMessages = vi.fn().mockRejectedValue(
      Object.assign(new Error("Unsupported search clause"), {
        statusCode: 400,
        code: "BadRequest",
      }),
    );

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: String.raw`subject:"Folder \ Review" unread`,
      limit: 20,
    });

    expect(result.microsoftSearchFeedback.retryQueries).toContain(
      String.raw`"Folder \\ Review"`,
    );
  });

  it("searchInbox keeps the generic Google failure payload unchanged", async () => {
    const searchMessages = vi
      .fn()
      .mockRejectedValue(new Error("Search syntax failed"));

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "from:sender@example.com",
      limit: 20,
    });

    expect(result).toEqual({
      queryUsed: "from:sender@example.com",
      error: "Failed to search inbox",
    });
    expect(searchMessages).toHaveBeenCalledTimes(1);
  });
});

describe("chat inbox tools - sender categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSenderCategoryOverview returns the shared overview payload", async () => {
    mockGetCategoryOverview.mockResolvedValue({
      autoCategorizeSenders: true,
      categorization: {
        status: "completed",
        totalItems: 4,
        completedItems: 4,
        remainingItems: 0,
        message: "Sender categorization completed for 4 senders.",
      },
      categorizedSenderCount: 12,
      uncategorizedSenderCount: 3,
      categories: [],
    });

    const toolInstance = getSenderCategoryOverviewTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await (toolInstance.execute as any)({});

    expect(mockGetCategoryOverview).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(result.categorizedSenderCount).toBe(12);
  });

  it("startSenderCategorization delegates to the shared start helper", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      provider: "google",
    } as any);
    mockStartBulkCategorization.mockResolvedValue({
      started: true,
      alreadyRunning: false,
      totalQueuedSenders: 8,
      autoCategorizeSenders: true,
      progress: {
        status: "running",
        totalItems: 8,
        completedItems: 0,
        remainingItems: 8,
        message: "Categorizing senders: 0 of 8 completed.",
      },
    });

    const toolInstance = startSenderCategorizationTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({});

    expect(createEmailProvider).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });
    expect(mockStartBulkCategorization).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      emailProvider: { provider: "google" },
      logger,
    });
    expect(result.totalQueuedSenders).toBe(8);
  });

  it("getSenderCategorizationStatus waits briefly before reading progress", async () => {
    vi.useFakeTimers();
    mockGetCategorizationProgress.mockResolvedValue({
      totalItems: 8,
      completedItems: 3,
      status: "running",
      startedAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:01:00.000Z",
    });
    mockGetCategorizationStatusSnapshot.mockReturnValue({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    const toolInstance = getSenderCategorizationStatusTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const resultPromise = (toolInstance.execute as any)({ waitMs: 250 });

    await vi.advanceTimersByTimeAsync(250);

    const result = await resultPromise;

    expect(mockGetCategorizationProgress).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
    });
    expect(result).toEqual({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    vi.useRealTimers();
  });

  it("getSenderCategorizationStatus caps waitMs at 1500", async () => {
    vi.useFakeTimers();
    mockGetCategorizationProgress.mockResolvedValue({
      totalItems: 8,
      completedItems: 3,
      status: "running",
      startedAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:01:00.000Z",
    });
    mockGetCategorizationStatusSnapshot.mockReturnValue({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    const toolInstance = getSenderCategorizationStatusTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const resultPromise = (toolInstance.execute as any)({ waitMs: 2000 });

    await vi.advanceTimersByTimeAsync(1499);
    expect(mockGetCategorizationProgress).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    const result = await resultPromise;

    expect(mockGetCategorizationProgress).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
    });
    expect(result).toEqual({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    vi.useRealTimers();
  });

  it("manageSenderCategory delegates to the archive helper", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      provider: "google",
    } as any);
    mockArchiveCategory.mockResolvedValue({
      success: true,
      action: "archive_category",
      category: { id: "cat-1", name: "Newsletters" },
      sendersCount: 6,
      senders: ["one@example.com"],
      message: 'Archived mail from 6 senders in "Newsletters".',
    });

    const toolInstance = manageSenderCategoryTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "archive_category",
      categoryId: "cat-1",
    });

    expect(mockArchiveCategory).toHaveBeenCalledWith({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      emailProvider: { provider: "google" },
      logger,
      categoryId: "cat-1",
      categoryName: undefined,
    });
    expect(result.sendersCount).toBe(6);
  });
});
