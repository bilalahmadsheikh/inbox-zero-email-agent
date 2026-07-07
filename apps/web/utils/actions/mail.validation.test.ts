import { describe, expect, it } from "vitest";
import { scheduleSendBody } from "./mail.validation";

const baseEmail = {
  to: "someone@example.com",
  subject: "Hello",
  messageHtml: "<p>Hi</p>",
};

describe("scheduleSendBody", () => {
  it("accepts a send time an hour from now", () => {
    const result = scheduleSendBody.safeParse({
      ...baseEmail,
      sendAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    expect(result.success).toBe(true);
  });

  it("coerces ISO strings to dates", () => {
    const result = scheduleSendBody.safeParse({
      ...baseEmail,
      sendAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sendAt).toBeInstanceOf(Date);
  });

  it("rejects send times in the past", () => {
    const result = scheduleSendBody.safeParse({
      ...baseEmail,
      sendAt: new Date(Date.now() - 1000),
    });
    expect(result.success).toBe(false);
  });

  it("rejects send times more than 90 days out", () => {
    const result = scheduleSendBody.safeParse({
      ...baseEmail,
      sendAt: new Date(Date.now() + 91 * 24 * 60 * 60 * 1000),
    });
    expect(result.success).toBe(false);
  });

  it("strips attachments", () => {
    const result = scheduleSendBody.safeParse({
      ...baseEmail,
      sendAt: new Date(Date.now() + 60 * 60 * 1000),
      attachments: [
        { filename: "a.txt", content: "x", contentType: "text/plain" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("attachments" in result.data).toBe(false);
    }
  });
});
