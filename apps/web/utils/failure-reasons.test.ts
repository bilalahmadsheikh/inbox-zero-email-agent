import { describe, it, expect } from "vitest";
import {
  formatFailureReasons,
  summarizeFailureReasons,
} from "./failure-reasons";

function rejected(message: string) {
  return {
    result: { status: "rejected", reason: new Error(message) } as const,
  };
}

function fulfilled() {
  return { result: { status: "fulfilled", value: undefined } as const };
}

describe("summarizeFailureReasons", () => {
  it("groups identical causes so one repeated failure is not many prompt lines", () => {
    const reasons = summarizeFailureReasons([
      rejected("cannot modify draft"),
      rejected("cannot modify draft"),
      rejected("cannot modify draft"),
      rejected("rate limit exceeded"),
      fulfilled(),
    ]);

    expect(reasons).toEqual([
      { reason: "cannot modify draft", count: 3 },
      { reason: "rate limit exceeded", count: 1 },
    ]);
  });

  it("redacts addresses that providers echo back in errors", () => {
    const [first] = summarizeFailureReasons([
      rejected("Invalid recipient sarah@acme.com for this mailbox"),
    ]);

    expect(first.reason).toBe("Invalid recipient [address] for this mailbox");
  });

  it("caps how many distinct causes are surfaced", () => {
    const reasons = summarizeFailureReasons(
      [rejected("a"), rejected("b"), rejected("c"), rejected("d")],
      2,
    );

    expect(reasons).toHaveLength(2);
  });

  it("returns nothing when everything succeeded", () => {
    expect(summarizeFailureReasons([fulfilled(), fulfilled()])).toEqual([]);
  });

  it("survives a rejection that is not an Error", () => {
    expect(
      summarizeFailureReasons([
        { result: { status: "rejected", reason: undefined } as const },
      ]),
    ).toEqual([{ reason: "Unknown error", count: 1 }]);
  });

  it("truncates a long provider message rather than pasting it whole", () => {
    const [first] = summarizeFailureReasons([rejected("x".repeat(500))]);

    expect(first.reason.length).toBeLessThanOrEqual(141);
    expect(first.reason.endsWith("…")).toBe(true);
  });
});

describe("formatFailureReasons", () => {
  it("reads as a sentence and only counts repeats", () => {
    expect(
      formatFailureReasons([
        { reason: "cannot modify draft", count: 2 },
        { reason: "rate limited", count: 1 },
      ]),
    ).toBe("cannot modify draft (2); rate limited");
  });

  it("returns null when there is nothing to report", () => {
    expect(formatFailureReasons([])).toBeNull();
  });
});
