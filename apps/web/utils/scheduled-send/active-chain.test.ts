import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getThreadIdsWithActiveScheduledChain } from "./active-chain";

vi.mock("@/utils/prisma");

describe("getThreadIdsWithActiveScheduledChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the set of threads with a pending scheduled email", async () => {
    prisma.scheduledEmail.findMany.mockResolvedValue([
      { threadId: "t1" },
      { threadId: "t3" },
      { threadId: null },
    ] as any);

    const result = await getThreadIdsWithActiveScheduledChain({
      emailAccountId: "ea1",
      threadIds: ["t1", "t2", "t3"],
    });

    expect(prisma.scheduledEmail.findMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "ea1",
        status: "PENDING",
        threadId: { in: ["t1", "t2", "t3"] },
      },
      select: { threadId: true },
    });
    expect(result).toEqual(new Set(["t1", "t3"]));
  });

  it("does not query when there are no thread ids", async () => {
    const result = await getThreadIdsWithActiveScheduledChain({
      emailAccountId: "ea1",
      threadIds: [],
    });

    expect(prisma.scheduledEmail.findMany).not.toHaveBeenCalled();
    expect(result).toEqual(new Set());
  });
});
