import { describe, it, expect } from "vitest";
import {
  resolveAttachmentSettings,
  senderMatchesList,
  attachmentMimeToFileType,
  DEFAULT_ATTACHMENT_MAX_SIZE_MB,
} from "./settings";

describe("resolveAttachmentSettings", () => {
  it("returns defaults for null", () => {
    const result = resolveAttachmentSettings(null);
    expect(result.fileTypes).toEqual(["pdf", "word", "text"]);
    expect(result.maxSizeBytes).toBe(
      DEFAULT_ATTACHMENT_MAX_SIZE_MB * 1024 * 1024,
    );
    expect(result.allowSenders).toEqual([]);
    expect(result.denySenders).toEqual([]);
    expect(result.nameExclusions).toEqual([]);
  });

  it("normalizes lists (trim, lowercase, dedupe, drop empties)", () => {
    const result = resolveAttachmentSettings({
      allowSenders: [" Foo@Bar.com ", "foo@bar.com", ""],
      nameExclusions: ["Medical", "medical"],
      maxSizeMb: 10,
      fileTypes: ["pdf"],
    });
    expect(result.allowSenders).toEqual(["foo@bar.com"]);
    expect(result.nameExclusions).toEqual(["medical"]);
    expect(result.maxSizeBytes).toBe(10 * 1024 * 1024);
    expect(result.fileTypes).toEqual(["pdf"]);
  });

  it("falls back to defaults when the stored value is invalid", () => {
    const result = resolveAttachmentSettings({ maxSizeMb: 999 });
    expect(result.fileTypes).toEqual(["pdf", "word", "text"]);
    expect(result.maxSizeBytes).toBe(
      DEFAULT_ATTACHMENT_MAX_SIZE_MB * 1024 * 1024,
    );
  });
});

describe("senderMatchesList", () => {
  it("matches a full email address", () => {
    expect(senderMatchesList("a@b.com", ["a@b.com"])).toBe(true);
    expect(senderMatchesList("a@b.com", ["x@b.com"])).toBe(false);
  });

  it("matches a bare domain and its subdomains", () => {
    expect(senderMatchesList("a@acme.com", ["acme.com"])).toBe(true);
    expect(senderMatchesList("a@mail.acme.com", ["acme.com"])).toBe(true);
    expect(senderMatchesList("a@notacme.com", ["acme.com"])).toBe(false);
  });

  it("is case-insensitive and empty-safe", () => {
    expect(senderMatchesList("A@ACME.com", ["acme.com"])).toBe(true);
    expect(senderMatchesList("a@b.com", [])).toBe(false);
    expect(senderMatchesList("", ["b.com"])).toBe(false);
  });
});

describe("attachmentMimeToFileType", () => {
  it("maps supported mime types and rejects others", () => {
    expect(attachmentMimeToFileType("application/pdf")).toBe("pdf");
    expect(
      attachmentMimeToFileType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("word");
    expect(attachmentMimeToFileType("text/plain")).toBe("text");
    expect(attachmentMimeToFileType("image/png")).toBeNull();
  });
});
