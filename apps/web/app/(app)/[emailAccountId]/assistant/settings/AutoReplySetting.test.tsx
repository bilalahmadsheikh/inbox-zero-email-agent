/** @vitest-environment jsdom */

import type React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { AutoReplySetting } from "@/app/(app)/[emailAccountId]/assistant/settings/AutoReplySetting";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";

// LoadingContent's error display reaches server-only modules under jsdom; it
// is not what this test is about.
vi.mock("@/components/LoadingContent", () => ({
  LoadingContent: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/useEmailAccountFull", () => ({
  useEmailAccountFull: vi.fn(),
}));
vi.mock("@/utils/actions/rule", () => ({
  updateAutoReplySettingsAction: { bind: () => vi.fn() },
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ executeAsync: vi.fn(), isExecuting: false }),
}));

function renderWith(data: Record<string, unknown> | undefined) {
  vi.mocked(useEmailAccountFull).mockReturnValue({
    data: data as any,
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  } as any);
  return render(<AutoReplySetting />);
}

describe("AutoReplySetting", () => {
  afterEach(() => cleanup());

  it("shows the account's current bar for sending", () => {
    renderWith({
      id: "account-1",
      autoReplyEnabled: true,
      autoReplyConfidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });

    expect(screen.getByText("Automatic replies")).toBeTruthy();
    expect(screen.getByText("High confidence")).toBeTruthy();
    expect(
      screen
        .getByRole("combobox", { name: "Automatic reply confidence" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("locks the confidence bar while automatic replies are off", () => {
    renderWith({
      id: "account-1",
      autoReplyEnabled: false,
      autoReplyConfidence: DraftReplyConfidence.STANDARD,
    });

    expect(
      screen
        .getByRole("combobox", { name: "Automatic reply confidence" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
