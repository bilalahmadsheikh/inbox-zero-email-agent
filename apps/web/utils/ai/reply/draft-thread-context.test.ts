import { describe, expect, it } from "vitest";
import {
  buildDraftThreadMessages,
  LATEST_MESSAGE_MAX_CHARS,
} from "@/utils/ai/reply/draft-thread-context";
import { getMockMessage } from "@/__tests__/helpers";

function buildMessage(id: string, body: string) {
  return getMockMessage({
    id,
    threadId: "thread-1",
    textPlain: body,
    // getEmailForLLM prefers the HTML part, so both must carry the body.
    textHtml: `<p>${body}</p>`,
    snippet: body.slice(0, 50),
  });
}

const longBody = "x".repeat(20_000);

describe("buildDraftThreadMessages", () => {
  it("gives the message being replied to the full latest budget", () => {
    const messages = buildDraftThreadMessages([
      buildMessage("msg-1", longBody),
      buildMessage("msg-2", longBody),
    ]);

    const latest = messages[messages.length - 1];
    // Notice is appended past the budget, so the body itself is the budget.
    expect(latest.content.length).toBeGreaterThan(LATEST_MESSAGE_MAX_CHARS);
    expect(latest.content.slice(0, LATEST_MESSAGE_MAX_CHARS)).toHaveLength(
      LATEST_MESSAGE_MAX_CHARS,
    );
  });

  it("tells the model when a message was cut instead of cutting silently", () => {
    const messages = buildDraftThreadMessages([
      buildMessage("msg-1", longBody),
    ]);

    expect(messages[0].content).toContain("truncated");
  });

  it("leaves a short message untouched and adds no notice", () => {
    const short = "Thanks, that works for me.";
    const messages = buildDraftThreadMessages([buildMessage("msg-1", short)]);

    expect(messages[0].content).toBe(short);
    expect(messages[0].content).not.toContain("truncated");
  });

  it("gives recent history more room than the top of a long thread", () => {
    const thread = Array.from({ length: 12 }, (_, index) =>
      buildMessage(`msg-${index}`, longBody),
    );

    const messages = buildDraftThreadMessages(thread);
    const newestHistory = messages[messages.length - 2].content.length;
    const oldestHistory = messages[0].content.length;

    expect(newestHistory).toBeGreaterThan(oldestHistory);
  });

  it("keeps every message in the thread even once the budget is spent", () => {
    const thread = Array.from({ length: 30 }, (_, index) =>
      buildMessage(`msg-${index}`, longBody),
    );

    const messages = buildDraftThreadMessages(thread);

    expect(messages).toHaveLength(30);
    for (const message of messages) {
      expect(message.content.length).toBeGreaterThan(0);
    }
  });
});
