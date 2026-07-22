import { describe, expect, it } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import { isDraftReplyActionType } from "./draft-reply";

describe("isDraftReplyActionType", () => {
  it.each([
    ActionType.DRAFT_EMAIL,
    ActionType.DRAFT_MESSAGING_CHANNEL,
    ActionType.REPLY,
  ])("routes %s through grounded draft generation", (actionType) => {
    expect(isDraftReplyActionType(actionType)).toBe(true);
  });

  it("does not route unrelated actions through draft generation", () => {
    expect(isDraftReplyActionType(ActionType.ARCHIVE)).toBe(false);
  });
});
