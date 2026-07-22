import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import {
  generateNudgeReplyAction,
  generateReplyDraftAction,
} from "@/utils/actions/generate-reply";
import { DRAFT_PIPELINE_VERSION } from "@/utils/ai/reply/draft-attribution";
import { aiGenerateNudge } from "@/utils/ai/reply/generate-nudge";
import { getReply, saveReply } from "@/utils/redis/reply";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { createEmailProvider } from "@/utils/email/provider";
import { fetchMessagesAndGenerateDraft } from "@/utils/reply-tracker/generate-draft";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/ai/reply/generate-nudge");
vi.mock("@/utils/redis/reply");
vi.mock("@/utils/user/get");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/reply-tracker/generate-draft");
vi.mock("@/utils/get-email-from-message", () => ({
  getEmailForLLM: vi.fn(() => ({
    id: "m1",
    from: "sender@example.com",
    to: "user@example.com",
    subject: "Question",
    content: "hello",
    date: new Date(),
  })),
}));

describe("generateNudgeReplyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
  });

  it("stores generated nudges without draft attribution metadata", async () => {
    vi.mocked(getEmailAccountWithAi).mockResolvedValue({
      id: "account-1",
      email: "user@example.com",
    } as any);
    vi.mocked(getReply).mockResolvedValue(null);
    vi.mocked(aiGenerateNudge).mockResolvedValue({
      text: "Follow up message",
      attribution: {
        provider: "openai",
        modelName: "gpt-5-mini",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    } as any);

    const result = await generateNudgeReplyAction("account-1", {
      messages: [
        {
          id: "message-1",
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Question",
          textPlain: "Can you follow up?",
          date: "2026-03-16T10:00:00.000Z",
        },
      ],
    });

    expect(saveReply).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      messageId: "message-1",
      reply: "Follow up message",
      confidence: DraftReplyConfidence.ALL_EMAILS,
      attribution: {
        provider: "openai",
        modelName: "gpt-5-mini",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });
    expect(result?.data).toEqual({ text: "Follow up message" });
  });
});

describe("generateReplyDraftAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-1", provider: "google" },
    } as any);

    vi.mocked(getEmailAccountWithAi).mockResolvedValue({
      id: "account-1",
      email: "user@example.com",
      account: { provider: "google" },
    } as any);
  });

  it("drafts a grounded HTML reply for an inbound thread", async () => {
    const inboundMessage = {
      id: "m1",
      internalDate: "1",
      labelIds: ["INBOX"],
      headers: { from: "sender@example.com", to: "user@example.com" },
    };
    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages: vi.fn().mockResolvedValue([inboundMessage]),
      isSentMessage: vi.fn().mockReturnValue(false),
    } as any);
    vi.mocked(fetchMessagesAndGenerateDraft).mockResolvedValue("<p>Reply</p>");

    const result = await generateReplyDraftAction("account-1", {
      threadId: "thread-1",
    });

    expect(fetchMessagesAndGenerateDraft).toHaveBeenCalled();
    expect(aiGenerateNudge).not.toHaveBeenCalled();
    expect(result?.data).toEqual({ text: "<p>Reply</p>", isHtml: true });
  });

  it("writes a plain-text nudge when the user sent last", async () => {
    const sentMessage = {
      id: "m1",
      internalDate: "1",
      labelIds: ["SENT"],
      headers: { from: "user@example.com", to: "sender@example.com" },
    };
    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages: vi.fn().mockResolvedValue([sentMessage]),
      isSentMessage: vi.fn().mockReturnValue(true),
    } as any);
    vi.mocked(aiGenerateNudge).mockResolvedValue({
      text: "Just following up",
      attribution: null,
    } as any);

    const result = await generateReplyDraftAction("account-1", {
      threadId: "thread-1",
      instruction: "be brief",
    });

    expect(aiGenerateNudge).toHaveBeenCalledWith(
      expect.objectContaining({ instruction: "be brief" }),
    );
    expect(fetchMessagesAndGenerateDraft).not.toHaveBeenCalled();
    expect(result?.data).toEqual({ text: "Just following up", isHtml: false });
  });
});
