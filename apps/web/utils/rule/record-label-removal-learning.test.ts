import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupItemSource, SystemType } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { recordLabelRemovalLearning } from "./record-label-removal-learning";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/prisma");
vi.mock("@/utils/rule/learned-patterns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./learned-patterns")>();
  return {
    ...actual,
    saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
  };
});

const logger = createTestLogger();

describe("recordLabelRemovalLearning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveLearnedPattern).mockResolvedValue(undefined);
    prisma.emailAccount.findUnique.mockResolvedValue({
      learnedPatternsEnabled: true,
    } as any);
  });

  it("skips when sender is missing", async () => {
    await recordLabelRemovalLearning({
      sender: null,
      ruleId: "rule-1",
      systemType: SystemType.NEWSLETTER,
      messageId: "message-1",
      threadId: "thread-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("skips when rule type is not learnable", async () => {
    await recordLabelRemovalLearning({
      sender: "sender@example.com",
      ruleId: "rule-1",
      systemType: SystemType.TO_REPLY,
      messageId: "message-1",
      threadId: "thread-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
  });

  it("records learning with shared label-removal defaults", async () => {
    await recordLabelRemovalLearning({
      sender: "sender@example.com",
      ruleId: "rule-1",
      systemType: SystemType.NEWSLETTER,
      messageId: "message-1",
      threadId: "thread-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(saveLearnedPattern).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      from: "sender@example.com",
      ruleId: "rule-1",
      exclude: true,
      logger,
      messageId: "message-1",
      threadId: "thread-1",
      reason: "Label removed",
      source: GroupItemSource.LABEL_REMOVED,
    });
  });

  it("skips saving when learned patterns are disabled for the account", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      learnedPatternsEnabled: false,
    } as any);

    await recordLabelRemovalLearning({
      sender: "sender@example.com",
      ruleId: "rule-1",
      systemType: SystemType.NEWSLETTER,
      messageId: "message-1",
      threadId: "thread-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith({
      where: { id: "email-account-1" },
      select: { learnedPatternsEnabled: true },
    });
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });
});
