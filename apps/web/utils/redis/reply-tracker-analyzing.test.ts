import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import { isAnalyzingReplyTracker } from "@/utils/redis/reply-tracker-analyzing";

vi.mock("@/utils/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

describe("isAnalyzingReplyTracker", () => {
  beforeEach(() => {
    vi.mocked(redis.get).mockReset();
  });

  it("reports analysing when the flag is set", async () => {
    vi.mocked(redis.get).mockResolvedValue("true");

    await expect(
      isAnalyzingReplyTracker({ emailAccountId: "account-1" }),
    ).resolves.toBe(true);
  });

  it("falls back to not analysing instead of throwing when Redis fails", async () => {
    vi.mocked(redis.get).mockRejectedValue(new Error("Upstash unreachable"));

    await expect(
      isAnalyzingReplyTracker({ emailAccountId: "account-1" }),
    ).resolves.toBe(false);
  });
});
