import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { cancelScheduledEmailChain } from "./cancel";

vi.mock("@/utils/prisma");

describe("cancelScheduledEmailChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels every pending occurrence in the chain from a stale row", async () => {
    prisma.scheduledEmail.findFirst.mockResolvedValue({
      id: "se-2",
      chainRootId: "se-1",
      repeatEveryMinutes: 2,
      // biome-ignore lint/suspicious/noExplicitAny: partial row mock
    } as any);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });

    const result = await cancelScheduledEmailChain({
      emailAccountId: "ea1",
      id: "se-2",
    });

    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "ea1",
        status: "PENDING",
        OR: [{ id: "se-2" }, { id: "se-1" }, { chainRootId: "se-1" }],
      },
      data: { status: "CANCELLED" },
    });
    expect(result).toEqual({ ok: true, cancelledCount: 1 });
  });

  it("uses the row itself as chain root for first occurrences", async () => {
    prisma.scheduledEmail.findFirst.mockResolvedValue({
      id: "se-1",
      chainRootId: null,
      repeatEveryMinutes: null,
      // biome-ignore lint/suspicious/noExplicitAny: partial row mock
    } as any);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });

    await cancelScheduledEmailChain({ emailAccountId: "ea1", id: "se-1" });

    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ id: "se-1" }, { id: "se-1" }, { chainRootId: "se-1" }],
        }),
      }),
    );
  });

  it("reports a finished chain distinctly from a sent single email", async () => {
    prisma.scheduledEmail.findFirst.mockResolvedValue({
      id: "se-2",
      chainRootId: "se-1",
      repeatEveryMinutes: 2,
      // biome-ignore lint/suspicious/noExplicitAny: partial row mock
    } as any);
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 0 });

    expect(
      await cancelScheduledEmailChain({ emailAccountId: "ea1", id: "se-2" }),
    ).toEqual({ ok: false, reason: "chain_finished" });

    prisma.scheduledEmail.findFirst.mockResolvedValue({
      id: "se-3",
      chainRootId: null,
      repeatEveryMinutes: null,
      // biome-ignore lint/suspicious/noExplicitAny: partial row mock
    } as any);

    expect(
      await cancelScheduledEmailChain({ emailAccountId: "ea1", id: "se-3" }),
    ).toEqual({ ok: false, reason: "already_done" });
  });

  it("reports not_found for unknown or foreign rows", async () => {
    prisma.scheduledEmail.findFirst.mockResolvedValue(null);

    expect(
      await cancelScheduledEmailChain({ emailAccountId: "ea1", id: "nope" }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(prisma.scheduledEmail.updateMany).not.toHaveBeenCalled();
  });
});
