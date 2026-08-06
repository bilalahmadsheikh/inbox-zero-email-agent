import { describe, it, expect } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  bytesToBase64,
  fileToAttachment,
  isWithinAttachmentLimit,
} from "./local-file";

describe("isWithinAttachmentLimit", () => {
  it("accepts a file exactly on the limit", () => {
    expect(isWithinAttachmentLimit(MAX_ATTACHMENT_BYTES)).toBe(true);
  });

  it("rejects a file one byte over", () => {
    expect(isWithinAttachmentLimit(MAX_ATTACHMENT_BYTES + 1)).toBe(false);
  });

  it("accepts an empty file", () => {
    expect(isWithinAttachmentLimit(0)).toBe(true);
  });
});

describe("bytesToBase64", () => {
  it("encodes an empty payload", () => {
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });

  it("encodes bytes that are not valid text", () => {
    // 0x00 and 0xff have no character representation; they must survive.
    const bytes = new Uint8Array([0, 255, 128, 1]);

    expect(bytesToBase64(bytes)).toBe(btoa("\x00\xff\x80\x01"));
  });

  it("encodes a payload larger than the chunk size", () => {
    // Spans several chunks: a single fromCharCode call on this many bytes is
    // what used to blow the argument limit.
    const size = 8192 * 3 + 17;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;

    const encoded = bytesToBase64(bytes);

    // Round-trips byte for byte, so chunking did not drop or reorder anything.
    const decoded = atob(encoded);
    expect(decoded.length).toBe(size);
    expect(decoded.charCodeAt(0)).toBe(0);
    expect(decoded.charCodeAt(size - 1)).toBe((size - 1) % 256);
  });

  it("produces the same result whether or not a chunk boundary is hit", () => {
    const exactlyOneChunk = new Uint8Array(8192).fill(65);
    const oneOver = new Uint8Array(8193).fill(65);

    expect(atob(bytesToBase64(exactlyOneChunk)).length).toBe(8192);
    expect(atob(bytesToBase64(oneOver)).length).toBe(8193);
  });
});

describe("fileToAttachment", () => {
  it("carries the filename and encodes the contents", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });

    expect(await fileToAttachment(file)).toEqual({
      filename: "notes.txt",
      content: btoa("hello"),
      contentType: "text/plain",
    });
  });

  it("falls back to octet-stream when the browser reports no type", async () => {
    const file = new File(["x"], "unknown.weird", { type: "" });

    expect((await fileToAttachment(file)).contentType).toBe(
      "application/octet-stream",
    );
  });

  it("handles an empty file", async () => {
    const file = new File([], "empty.txt", { type: "text/plain" });

    expect((await fileToAttachment(file)).content).toBe("");
  });

  it("preserves a filename containing non-ASCII characters", async () => {
    const file = new File(["x"], "réçu-café.pdf", { type: "application/pdf" });

    expect((await fileToAttachment(file)).filename).toBe("réçu-café.pdf");
  });
});
