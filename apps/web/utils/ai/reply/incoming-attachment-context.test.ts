import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailProvider } from "@/utils/email/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import {
  chunkAttachmentText,
  getIncomingAttachmentContext,
  getAttachmentProcessingMode,
} from "./incoming-attachment-context";

const { extractTextFromDocumentMock, generateObjectMock } = vi.hoisted(() => ({
  extractTextFromDocumentMock: vi.fn(),
  generateObjectMock: vi.fn(),
}));

vi.mock("@/utils/drive/document-extraction", () => ({
  extractTextFromDocument: extractTextFromDocumentMock,
  isExtractableMimeType: () => true,
}));

vi.mock("@/utils/llms", () => ({
  createGenerateObject: () => generateObjectMock,
}));

vi.mock("@/utils/llms/use-cases", () => ({
  getModelForUseCase: () => ({}),
  LlmUseCase: { IncomingAttachmentContext: "incoming-attachment-context" },
}));

const logger = createScopedLogger("incoming-attachment-context-test");

describe("incoming attachment context routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("marks context incomplete when one document section fails", async () => {
    extractTextFromDocumentMock.mockResolvedValue({
      text: "a".repeat(60_000),
      truncated: false,
    });
    generateObjectMock
      .mockResolvedValueOnce({ object: { relevantContext: "First fact" } })
      .mockRejectedValueOnce(new Error("temporary extraction failure"));

    const result = await getIncomingAttachmentContext({
      messages: [
        {
          id: "message-1",
          attachments: [
            {
              attachmentId: "attachment-1",
              filename: "report.pdf",
              mimeType: "application/pdf",
              size: 60_000,
            },
          ],
        } as ParsedMessage,
      ],
      emailContent: "Please summarize the report.",
      emailAccount: {
        user: {},
        email: "owner@example.com",
      } as EmailAccountWithAI,
      provider: {
        getAttachment: vi.fn().mockResolvedValue({ data: "YQ==" }),
      } as unknown as EmailProvider,
      logger,
    });

    expect(result.truncated).toBe(true);
    expect(result.content).toContain("[Section 1] First fact");
    expect(result.content).toContain(
      "[Section 2 unavailable: extraction failed. Do not infer its contents.]",
    );
  });
});
