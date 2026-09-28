import { describe, expect, it } from "vitest";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import {
  AUTO_REPLY_DAILY_LIMIT,
  getAutoReplyBlockReason,
} from "@/utils/reply-tracker/auto-reply-guard";
import type { ParsedMessageHeaders } from "@/utils/types";

const USER = "me@example.com";
const NOW = new Date("2026-09-28T12:00:00Z");

function check(
  headers: Partial<ParsedMessageHeaders> = {},
  overrides: Partial<Parameters<typeof getAutoReplyBlockReason>[0]> = {},
) {
  return getAutoReplyBlockReason({
    message: {
      headers: {
        from: "Sarah <sarah@client.com>",
        to: USER,
        subject: "Question",
        date: NOW.toISOString(),
        ...headers,
      },
      internalDate: String(NOW.getTime() - 5 * 60 * 1000),
    },
    userEmail: USER,
    autoReplyEnabled: true,
    autoReplyConfidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    draftConfidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    hasRecentAutoReplyInThread: false,
    autoRepliesInLastDay: 0,
    userRepliedSinceMessage: false,
    now: NOW,
    ...overrides,
  });
}

describe("getAutoReplyBlockReason", () => {
  it("allows a confident reply to a real person", () => {
    expect(check()).toBeNull();
  });

  it("blocks everything when auto-reply is switched off", () => {
    expect(check({}, { autoReplyEnabled: false })).toBe("disabled");
  });

  it("never replies to the user's own mail", () => {
    expect(check({ from: "Me <ME@example.com>" })).toBe("self_sent");
  });

  it("does not answer someone else's out-of-office", () => {
    expect(check({ "auto-submitted": "auto-replied" })).toBe(
      "automated_sender",
    );
  });

  it("treats Auto-Submitted: no as a human message", () => {
    expect(check({ "auto-submitted": "no" })).toBeNull();
  });

  it("respects Exchange's request not to be auto-replied to", () => {
    expect(check({ "x-auto-response-suppress": "OOF, AutoReply" })).toBe(
      "automated_sender",
    );
  });

  it("does not reply to mailing lists", () => {
    expect(check({ "list-id": "<team.lists.example.com>" })).toBe(
      "mailing_list",
    );
    expect(check({ "list-unsubscribe": "<https://x.example/u>" })).toBe(
      "mailing_list",
    );
  });

  it("does not reply to addresses that cannot receive mail", () => {
    expect(check({ from: "noreply@service.com" })).toBe("send_only_sender");
  });

  it("holds back a reply the AI was unsure about", () => {
    expect(check({}, { draftConfidence: DraftReplyConfidence.STANDARD })).toBe(
      "low_confidence",
    );
    expect(check({}, { draftConfidence: null })).toBe("low_confidence");
  });

  it("sends a less certain reply only when the user chose a lower bar", () => {
    expect(
      check(
        {},
        {
          draftConfidence: DraftReplyConfidence.STANDARD,
          autoReplyConfidence: DraftReplyConfidence.STANDARD,
        },
      ),
    ).toBeNull();
  });

  it("does not auto-reply to an old email picked up by a backlog or bulk run", () => {
    const threeDaysAgo = String(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);

    expect(
      getAutoReplyBlockReason({
        message: {
          headers: {
            from: "sarah@client.com",
            to: USER,
            subject: "Old",
            date: NOW.toISOString(),
          },
          internalDate: threeDaysAgo,
        },
        userEmail: USER,
        autoReplyEnabled: true,
        autoReplyConfidence: DraftReplyConfidence.HIGH_CONFIDENCE,
        draftConfidence: DraftReplyConfidence.HIGH_CONFIDENCE,
        hasRecentAutoReplyInThread: false,
        autoRepliesInLastDay: 0,
        userRepliedSinceMessage: false,
        now: NOW,
      }),
    ).toBe("stale_message");
  });

  it("does not reply when the user has already answered", () => {
    expect(check({}, { userRepliedSinceMessage: true })).toBe(
      "already_replied",
    );
  });

  it("will not send a reply that Reply-To redirects to another domain", () => {
    expect(
      check({
        from: "Boss <boss@company.com>",
        "reply-to": "boss@lookalike-company.net",
      }),
    ).toBe("reply_to_mismatch");
  });

  it("allows a Reply-To on the sender's own domain", () => {
    expect(
      check({
        from: "sarah@client.com",
        "reply-to": "support@client.com",
      }),
    ).toBeNull();
  });

  it("stops a second automatic reply in the same thread", () => {
    expect(check({}, { hasRecentAutoReplyInThread: true })).toBe(
      "thread_limit",
    );
  });

  it("stops sending once the account hits its daily ceiling", () => {
    expect(check({}, { autoRepliesInLastDay: AUTO_REPLY_DAILY_LIMIT })).toBe(
      "daily_limit",
    );
    expect(
      check({}, { autoRepliesInLastDay: AUTO_REPLY_DAILY_LIMIT - 1 }),
    ).toBeNull();
  });
});
