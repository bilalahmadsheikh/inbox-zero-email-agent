import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, DraftReplyConfidence } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/choose-args";
import { fetchMessagesAndGenerateDraftWithConfidenceThreshold } from "@/utils/reply-tracker/generate-draft";
import { aiGenerateArgs } from "@/utils/ai/choose-rule/ai-choose-args";
import { createScopedLogger } from "@/utils/logger";
import { getMockMessage } from "@/__tests__/helpers";

vi.mock("@/utils/prisma");
vi.mock("@/utils/reply-tracker/generate-draft", () => ({
  fetchMessagesAndGenerateDraftWithConfidenceThreshold: vi.fn(),
}));
vi.mock("@/utils/ai/choose-rule/ai-choose-args", () => ({
  aiGenerateArgs: vi.fn(),
}));

const logger = createScopedLogger("choose-args-auto-reply-test");

function buildRule(actionOverrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    actions: [
      {
        id: "action-reply",
        type: ActionType.REPLY,
        content: null,
        delayInMinutes: 10,
        ...actionOverrides,
      },
    ],
  } as any;
}

function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-1",
    email: "me@example.com",
    draftReplyConfidence: DraftReplyConfidence.ALL_EMAILS,
    autoReplyEnabled: true,
    autoReplyConfidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    learnedPatternsEnabled: false,
    ...overrides,
  } as any;
}

async function run({
  rule = buildRule(),
  account = buildAccount(),
  confidence = DraftReplyConfidence.HIGH_CONFIDENCE as DraftReplyConfidence,
  from = "Sarah <sarah@client.com>",
  threadMessages = vi.fn().mockResolvedValue([]),
  headers = {} as Record<string, string>,
} = {}) {
  vi.mocked(
    fetchMessagesAndGenerateDraftWithConfidenceThreshold,
  ).mockResolvedValue({ draft: "Sounds good.", confidence } as any);

  return getActionItemsWithAiArgs({
    message: (() => {
      const message = getMockMessage({ from, threadId: "thread-1" });
      return {
        ...message,
        headers: { ...message.headers, ...headers },
        internalDate: String(Date.now() - 60_000),
      };
    })(),
    emailAccount: account,
    selectedRule: rule,
    client: { getThreadMessages: threadMessages } as any,
    modelType: "default" as any,
    logger,
  });
}

describe("getActionItemsWithAiArgs auto-reply guard", () => {
  beforeEach(() => {
    vi.mocked(aiGenerateArgs).mockResolvedValue({
      args: undefined,
      attribution: null,
    } as any);
    prisma.executedAction.count.mockResolvedValue(0);
    prisma.scheduledAction.count.mockResolvedValue(0);
  });

  it("sends a confident AI reply to a real person", async () => {
    const [action] = await run();

    expect(action.type).toBe(ActionType.REPLY);
    expect(action.content).toBe("Sounds good.");
    expect(action.delayInMinutes).toBe(10);
  });

  it("turns an unsure reply into a draft instead of sending it", async () => {
    const [action] = await run({
      confidence: DraftReplyConfidence.STANDARD,
    });

    expect(action.type).toBe(ActionType.DRAFT_EMAIL);
    // The reply is kept, not discarded.
    expect(action.content).toBe("Sounds good.");
    expect(action.delayInMinutes).toBeNull();
  });

  it("turns every AI reply into a draft when auto-reply is switched off", async () => {
    const [action] = await run({
      account: buildAccount({ autoReplyEnabled: false }),
    });

    expect(action.type).toBe(ActionType.DRAFT_EMAIL);
  });

  it("drafts instead of sending a second automatic reply in a thread", async () => {
    prisma.executedAction.count.mockResolvedValue(1);

    const [action] = await run();

    expect(action.type).toBe(ActionType.DRAFT_EMAIL);
  });

  it("counts a reply still waiting in a hold window", async () => {
    prisma.scheduledAction.count.mockResolvedValue(1);

    const [action] = await run();

    expect(action.type).toBe(ActionType.DRAFT_EMAIL);
  });

  it("drafts when the user already answered before the rule ran", async () => {
    const [action] = await run({
      threadMessages: vi.fn().mockResolvedValue([
        {
          headers: { from: "me@example.com" },
          internalDate: String(Date.now()),
        },
      ]),
    });

    expect(action.type).toBe(ActionType.DRAFT_EMAIL);
  });

  it("drafts rather than failing the rule when the thread cannot be read", async () => {
    const [action] = await run({
      threadMessages: vi.fn().mockRejectedValue(new Error("provider down")),
    });

    expect(action.type).toBe(ActionType.DRAFT_EMAIL);
    expect(action.content).toBe("Sounds good.");
  });

  it("keeps everyone a reply-all would have reached when it becomes a draft", async () => {
    const [action] = await run({
      rule: buildRule({ replyAll: true }),
      confidence: DraftReplyConfidence.STANDARD,
      headers: {
        to: "me@example.com, Tom <tom@client.com>",
        cc: "priya@partner.com",
      },
    });

    expect(action.type).toBe(ActionType.DRAFT_EMAIL);
    const cc = action.cc ?? "";
    expect(cc).toContain("tom@client.com");
    expect(cc).toContain("priya@partner.com");
    // Never the user themselves, and not the sender, who is already the
    // person the draft replies to.
    expect(cc).not.toContain("me@example.com");
    expect(cc).not.toContain("sarah@client.com");
  });

  it("keeps the rule's own Cc alongside the reply-all recipients", async () => {
    const [action] = await run({
      rule: buildRule({ replyAll: true, cc: "boss@company.com" }),
      confidence: DraftReplyConfidence.STANDARD,
      headers: { cc: "priya@partner.com" },
    });

    expect(action.cc).toContain("boss@company.com");
    expect(action.cc).toContain("priya@partner.com");
  });

  it("does not add anyone when the reply was only to the sender", async () => {
    const [action] = await run({
      rule: buildRule({ replyAll: false }),
      confidence: DraftReplyConfidence.STANDARD,
      headers: { cc: "priya@partner.com" },
    });

    expect(action.type).toBe(ActionType.DRAFT_EMAIL);
    expect(action.cc ?? null).toBeNull();
  });

  it("leaves a fixed-text reply rule exactly as it was", async () => {
    const [action] = await run({
      rule: buildRule({ content: "Thanks, received." }),
      account: buildAccount({ autoReplyEnabled: false }),
    });

    expect(action.type).toBe(ActionType.REPLY);
    expect(action.content).toBe("Thanks, received.");
  });
});
