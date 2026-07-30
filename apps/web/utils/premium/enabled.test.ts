import { describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/prisma");

import prisma from "@/utils/__mocks__/prisma";
import { PREMIUM_ENABLED } from "./enabled";
import { isPremiumBypassed } from "./index";
import { assertHasAiAccess } from "./limits";

// Regression coverage for the "an account's premium check silently blocked
// its email processing because a deploy was missing an env var" bug: premium
// must stay bypassed out of the box, with no env var required, until
// PREMIUM_ENABLED is deliberately flipped on.
describe("premium default state", () => {
  it("ships with premium hard-disabled", () => {
    expect(PREMIUM_ENABLED).toBe(false);
  });

  it("bypasses premium checks by default, with no env var required", () => {
    expect(isPremiumBypassed()).toBe(true);
  });

  // The point of the hard switch: a test account with no subscription row must
  // never be turned away while the product is still in development.
  it("lets an account with no subscription through the AI access check", async () => {
    prisma.user.findUnique.mockResolvedValue({ premium: null } as never);

    await expect(
      assertHasAiAccess({ userId: "unsubscribed-test-account" }),
    ).resolves.toBeUndefined();
  });
});
