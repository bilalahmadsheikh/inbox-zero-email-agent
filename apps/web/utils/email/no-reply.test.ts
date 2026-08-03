import { describe, it, expect } from "vitest";
import { isLikelySendOnlyAddress, isNoReplyAddress } from "./no-reply";

describe("isLikelySendOnlyAddress", () => {
  // Every one of these reached a recipient list in production despite being a
  // bulk sender that discards replies.
  it.each([
    "twitch@sfmarketing.twitch.tv",
    "promotions@news.bingoblitz.com",
    "orders@orders.daraz.pk",
    "hello@airconsole.com",
    "mail@deezer.com",
    "pokemongo@email.nianticlabs.com",
    "PL@email.premierleague.com",
  ])("excludes bulk sender %s", (address) => {
    expect(isLikelySendOnlyAddress(address)).toBe(true);
  });

  it.each([
    "noreply@quora.com",
    "no-reply@storeone.pk",
    "info@content.sonyliv.com",
  ])("still excludes the obvious %s", (address) => {
    expect(isLikelySendOnlyAddress(address)).toBe(true);
  });

  it.each([
    "sarah@acme.com",
    "dara.bodla@gmail.com",
    "j.smith@university.ac.uk",
    // A domain merely ending in a bulk-sounding word is not a bulk subdomain.
    "editor@daily.news",
  ])("keeps reachable address %s", (address) => {
    expect(isLikelySendOnlyAddress(address)).toBe(false);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(isLikelySendOnlyAddress("  NoReply@Example.COM ")).toBe(true);
  });
});

describe("isNoReplyAddress", () => {
  it("stays narrow so conversation filing is unaffected", () => {
    expect(isNoReplyAddress("noreply@example.com")).toBe(true);
    // Widening this would change which mail gets conversation rules.
    expect(isNoReplyAddress("hello@airconsole.com")).toBe(false);
    expect(isNoReplyAddress("PL@email.premierleague.com")).toBe(false);
  });
});
