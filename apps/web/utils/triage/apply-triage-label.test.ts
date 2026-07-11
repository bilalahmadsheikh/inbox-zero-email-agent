import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { labelMessageAndSync } from "@/utils/label.server";
import { applyTriageLabel } from "./apply-triage-label";

vi.mock("@/utils/prisma");
vi.mock("@/utils/label.server", () => ({
  labelMessageAndSync: vi.fn(),
}));

const logger = createScopedLogger("apply-triage-label-test");

function createClient(overrides: Record<string, unknown> = {}) {
  return {
    getLabelByName: vi.fn().mockResolvedValue(null),
    createLabel: vi.fn().mockResolvedValue({ id: "label-new" }),
    ...overrides,
    // biome-ignore lint/suspicious/noExplicitAny: partial provider mock
  } as any;
}

describe("applyTriageLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      triageLabelsEnabled: true,
      // biome-ignore lint/suspicious/noExplicitAny: partial row mock
    } as any);
  });

  it("does nothing when triage labels are disabled for the account", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      triageLabelsEnabled: false,
      // biome-ignore lint/suspicious/noExplicitAny: partial row mock
    } as any);
    const client = createClient();

    await applyTriageLabel({
      client,
      emailAccountId: "ea1",
      messageId: "m1",
      tier: "URGENT",
      logger,
    });

    expect(client.getLabelByName).not.toHaveBeenCalled();
    expect(labelMessageAndSync).not.toHaveBeenCalled();
  });

  it("labels the message with an existing tier label", async () => {
    const client = createClient({
      getLabelByName: vi.fn().mockResolvedValue({ id: "label-urgent" }),
    });

    await applyTriageLabel({
      client,
      emailAccountId: "ea1",
      messageId: "m1",
      tier: "URGENT",
      logger,
    });

    expect(client.getLabelByName).toHaveBeenCalledWith("Priority/Urgent");
    expect(client.createLabel).not.toHaveBeenCalled();
    expect(labelMessageAndSync).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: client,
        messageId: "m1",
        labelId: "label-urgent",
        labelName: "Priority/Urgent",
        emailAccountId: "ea1",
      }),
    );
  });

  it("creates the tier label when it does not exist", async () => {
    const client = createClient();

    await applyTriageLabel({
      client,
      emailAccountId: "ea1",
      messageId: "m1",
      tier: "FYI",
      logger,
    });

    expect(client.createLabel).toHaveBeenCalledWith("Priority/FYI");
    expect(labelMessageAndSync).toHaveBeenCalledWith(
      expect.objectContaining({ labelId: "label-new" }),
    );
  });

  it("never throws when the provider fails", async () => {
    const client = createClient({
      getLabelByName: vi.fn().mockRejectedValue(new Error("provider down")),
    });

    await expect(
      applyTriageLabel({
        client,
        emailAccountId: "ea1",
        messageId: "m1",
        tier: "IMPORTANT",
        logger,
      }),
    ).resolves.toBeUndefined();

    expect(labelMessageAndSync).not.toHaveBeenCalled();
  });
});
