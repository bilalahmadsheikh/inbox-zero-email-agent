import { describe, expect, it } from "vitest";
import {
  hasReferralSignature,
  renderReferralSignatureHtml,
  stripReferralSignature,
} from "./signature";

describe("referral signature", () => {
  it("renders new signatures with the Zynbox brand", () => {
    expect(renderReferralSignatureHtml("https://zynbox.cloud/?ref=ABC")).toBe(
      'Drafted by <a href="https://zynbox.cloud/?ref=ABC">Zynbox</a>.',
    );
  });

  it.each([
    "Drafted by Zynbox.",
    'Drafted by <a href="https://zynbox.cloud">Zynbox</a>.',
    "Drafted by Inbox Zero.",
    'Drafted by <a href="https://getinboxzero.com">Inbox Zero</a>.',
  ])("recognizes current and legacy signatures: %s", (signature) => {
    expect(hasReferralSignature(signature)).toBe(true);
    expect(stripReferralSignature(`Message body\n\n${signature}`)).toBe(
      "Message body",
    );
  });
});
