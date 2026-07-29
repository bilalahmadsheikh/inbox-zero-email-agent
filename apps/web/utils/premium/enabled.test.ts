import { describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

import { PREMIUM_ENABLED } from "./enabled";
import { isPremiumBypassed } from "./index";

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
});
