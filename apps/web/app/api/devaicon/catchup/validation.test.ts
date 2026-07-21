import { describe, expect, it } from "vitest";
import { catchupQuerySchema, parseSince } from "./validation";

describe("catchup validation", () => {
  it("parses an ISO 8601 since", () => {
    const date = parseSince("2026-07-15T10:00:00Z");
    expect(date?.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("parses epoch milliseconds since", () => {
    const ms = Date.UTC(2026, 6, 15, 10, 0, 0);
    const date = parseSince(String(ms));
    expect(date?.getTime()).toBe(ms);
  });

  it("returns null for an unparseable since", () => {
    expect(parseSince("not-a-date")).toBeNull();
  });

  it("requires since in the query schema", () => {
    expect(catchupQuerySchema.safeParse({}).success).toBe(false);
    expect(catchupQuerySchema.safeParse({ since: "2026-07-15" }).success).toBe(
      true,
    );
  });

  it("accepts an optional deliver flag and clamps limit", () => {
    const ok = catchupQuerySchema.safeParse({
      since: "1",
      deliver: "email",
      limit: "20",
    });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.limit).toBe(20);

    const bad = catchupQuerySchema.safeParse({
      since: "1",
      limit: "500",
    });
    expect(bad.success).toBe(false);
  });
});
