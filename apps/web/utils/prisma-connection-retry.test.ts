import { describe, expect, it, vi } from "vitest";
import {
  isConnectionSlotError,
  withConnectionSlotRetry,
} from "./prisma-connection-retry";

function slotError() {
  return Object.assign(new Error("Too many database connections opened"), {
    code: "P2037",
  });
}

describe("isConnectionSlotError", () => {
  it("matches P2037 errors", () => {
    expect(isConnectionSlotError(slotError())).toBe(true);
  });

  it("rejects other Prisma error codes", () => {
    const error = Object.assign(new Error("not found"), { code: "P2025" });
    expect(isConnectionSlotError(error)).toBe(false);
  });

  it("rejects non-object errors", () => {
    expect(isConnectionSlotError("P2037")).toBe(false);
    expect(isConnectionSlotError(null)).toBe(false);
    expect(isConnectionSlotError(undefined)).toBe(false);
  });
});

describe("withConnectionSlotRetry", () => {
  const noDelay = () => Promise.resolve();

  it("returns the result without retrying on success", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    await expect(withConnectionSlotRetry(run, noDelay)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("retries on slot exhaustion until it succeeds", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(slotError())
      .mockRejectedValueOnce(slotError())
      .mockResolvedValue("recovered");
    await expect(withConnectionSlotRetry(run, noDelay)).resolves.toBe(
      "recovered",
    );
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("gives up with the original error after exhausting attempts", async () => {
    const run = vi.fn().mockRejectedValue(slotError());
    await expect(withConnectionSlotRetry(run, noDelay)).rejects.toMatchObject({
      code: "P2037",
    });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("rethrows other errors immediately without retrying", async () => {
    const run = vi.fn().mockRejectedValue(new Error("syntax error"));
    await expect(withConnectionSlotRetry(run, noDelay)).rejects.toThrow(
      "syntax error",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
});
