import { describe, expect, it } from "vitest";
import {
  chunkAttachmentText,
  getAttachmentProcessingMode,
} from "./incoming-attachment-context";

describe("incoming attachment context routing", () => {
  it("uses direct context for documents that fit in the draft prompt", () => {
    expect(getAttachmentProcessingMode("a".repeat(12_000))).toBe("direct");
  });

  it("switches lengthy documents to chunked processing", () => {
    expect(getAttachmentProcessingMode("a".repeat(12_001))).toBe("chunked");
  });

  it("keeps all text in ordered, overlapping chunks", () => {
    const text = Array.from(
      { length: 30 },
      (_, index) => `Paragraph ${index}: ${"x".repeat(40)}`,
    ).join("\n\n");

    const chunks = chunkAttachmentText(text, { chunkSize: 240, overlap: 40 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toContain("Paragraph 0");
    expect(chunks.at(-1)).toContain("Paragraph 29");
    expect(chunks.every((chunk) => chunk.length <= 240)).toBe(true);
  });
});
