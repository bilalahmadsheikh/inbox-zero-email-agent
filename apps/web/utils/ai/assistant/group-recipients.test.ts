import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  GROUP_RECIPIENT_LIMIT,
  resolveGroupRecipients,
} from "./group-recipients";

vi.mock("@/utils/prisma");

const logger = createTestLogger();

function getProvider({
  label = null,
  threads = [],
}: {
  label?: { id: string; name: string } | null;
  threads?: { messages?: { headers?: { from?: string } }[] }[];
} = {}) {
  return {
    getLabelByName: vi.fn().mockResolvedValue(label),
    getThreadsWithQuery: vi.fn().mockResolvedValue({ threads }),
  } as any;
}

function mockCategory(
  senders: { email: string; name?: string | null }[] | null,
  name = "Marketing",
) {
  vi.mocked(prisma.category.findFirst).mockResolvedValue(
    senders
      ? ({
          name,
          emailSenders: senders.map((s) => ({
            email: s.email,
            name: s.name ?? null,
          })),
        } as never)
      : null,
  );
}

describe("resolveGroupRecipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes send-only addresses and reports them separately", async () => {
    mockCategory([
      { email: "person@acme.com", name: "A Person" },
      { email: "noreply@quora.com" },
      { email: "no-reply@storeone.pk" },
      { email: "info@content.sonyliv.com" },
    ]);

    const result = await resolveGroupRecipients({
      emailAccountId: "account-1",
      provider: getProvider(),
      group: "Marketing",
      logger,
    });

    expect(result.recipients.map((r) => r.email)).toEqual(["person@acme.com"]);
    expect(result.excludedNoReply).toHaveLength(3);
    expect(result.totalFound).toBe(4);
  });

  it("includes send-only addresses when explicitly asked", async () => {
    mockCategory([{ email: "person@acme.com" }, { email: "noreply@x.com" }]);

    const result = await resolveGroupRecipients({
      emailAccountId: "account-1",
      provider: getProvider(),
      group: "Marketing",
      includeNoReply: true,
      logger,
    });

    expect(result.recipients).toHaveLength(2);
    expect(result.excludedNoReply).toEqual([]);
  });

  it("merges label senders with category senders and deduplicates", async () => {
    mockCategory([{ email: "shared@acme.com", name: "Curated Name" }]);

    const result = await resolveGroupRecipients({
      emailAccountId: "account-1",
      provider: getProvider({
        label: { id: "label-1", name: "Marketing" },
        threads: [
          { messages: [{ headers: { from: "Shared <shared@acme.com>" } }] },
          { messages: [{ headers: { from: "Only Label <label@acme.com>" } }] },
        ],
      }),
      group: "Marketing",
      logger,
    });

    expect(result.recipients.map((r) => r.email).sort()).toEqual([
      "label@acme.com",
      "shared@acme.com",
    ]);
    // The curated category name wins over whatever the header said.
    expect(
      result.recipients.find((r) => r.email === "shared@acme.com")?.name,
    ).toBe("Curated Name");
    expect(result.matchedCategory).toBe("Marketing");
    expect(result.matchedLabel).toBe("Marketing");
  });

  it("still resolves from a label when no category has that name", async () => {
    mockCategory(null);

    const result = await resolveGroupRecipients({
      emailAccountId: "account-1",
      provider: getProvider({
        label: { id: "label-1", name: "Receipt" },
        threads: [
          { messages: [{ headers: { from: "Billing <billing@acme.com>" } }] },
        ],
      }),
      group: "Receipt",
      logger,
    });

    expect(result.recipients.map((r) => r.email)).toEqual(["billing@acme.com"]);
    expect(result.matchedCategory).toBeNull();
  });

  it("caps recipients and flags truncation", async () => {
    mockCategory(
      Array.from({ length: GROUP_RECIPIENT_LIMIT + 5 }, (_, i) => ({
        email: `person${i}@acme.com`,
      })),
    );

    const result = await resolveGroupRecipients({
      emailAccountId: "account-1",
      provider: getProvider(),
      group: "Marketing",
      logger,
    });

    expect(result.recipients).toHaveLength(GROUP_RECIPIENT_LIMIT);
    expect(result.truncated).toBe(true);
  });

  it("returns nothing for an unknown group rather than guessing", async () => {
    mockCategory(null);

    const result = await resolveGroupRecipients({
      emailAccountId: "account-1",
      provider: getProvider(),
      group: "Nonexistent",
      logger,
    });

    expect(result.recipients).toEqual([]);
    expect(result.matchedCategory).toBeNull();
    expect(result.matchedLabel).toBeNull();
    expect(result.truncated).toBe(false);
  });

  it("falls back to category results when the label lookup fails", async () => {
    mockCategory([{ email: "person@acme.com" }]);
    const provider = getProvider();
    provider.getLabelByName.mockRejectedValue(new Error("provider down"));

    const result = await resolveGroupRecipients({
      emailAccountId: "account-1",
      provider,
      group: "Marketing",
      logger,
    });

    expect(result.recipients.map((r) => r.email)).toEqual(["person@acme.com"]);
  });
});
