import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { createGenerateObject } from "@/utils/llms";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import {
  extractTextFromDocument,
  isExtractableMimeType,
} from "@/utils/drive/document-extraction";

// Bounds so a mail with many/large attachments can't blow up the digest job's
// cost or runtime. Only PDF/DOCX/plain-text are extractable.
const MAX_ATTACHMENTS = 2;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 8000;

const schema = z.object({
  summary: z
    .string()
    .describe(
      "Concise summary of the attachment(s), or an empty string if there is nothing worth summarizing.",
    ),
});

// Extracts text from a digest email's PDF/DOCX attachments and distills them to
// the essentials (contracts, decks, financial docs) so the summary can be shown
// in the digest alongside the email. Best-effort: returns null on any failure so
// it never breaks digest generation.
export async function summarizeDigestAttachments({
  emailAccount,
  provider,
  messageId,
  logger,
}: {
  emailAccount: EmailAccountWithAI & { name: string | null };
  provider: EmailProvider;
  messageId: string;
  logger: Logger;
}): Promise<string | null> {
  try {
    const message = await provider.getMessage(messageId);
    const candidates = (message.attachments ?? [])
      .filter(
        (attachment) =>
          attachment.attachmentId &&
          attachment.mimeType &&
          isExtractableMimeType(attachment.mimeType) &&
          (!attachment.size || attachment.size <= MAX_ATTACHMENT_BYTES),
      )
      .slice(0, MAX_ATTACHMENTS);

    if (candidates.length === 0) return null;

    const extracted: Array<{ filename: string; text: string }> = [];
    for (const attachment of candidates) {
      try {
        const data = await provider.getAttachment(
          messageId,
          attachment.attachmentId,
        );
        const buffer = Buffer.from(data.data, "base64");
        const result = await extractTextFromDocument(
          buffer,
          attachment.mimeType,
          {
            logger,
            maxLength: MAX_TEXT_CHARS,
          },
        );
        if (result?.text?.trim()) {
          extracted.push({
            filename: attachment.filename || "attachment",
            text: result.text,
          });
        }
      } catch (error) {
        logger.warn("Failed to extract attachment text for digest", { error });
      }
    }

    if (extracted.length === 0) return null;

    const system = `You summarize email attachments for a daily digest. Distill the document(s) to the essentials a busy reader needs.
- For contracts: parties, key terms, obligations, dates, amounts, and anything unusual or risky.
- For financial documents: the headline numbers, period, and notable changes.
- For decks/proposals: the core proposal, the ask, and key figures.
- For anything else: the main points only.
Guidelines:
- Be concise: at most 3 short lines. Separate distinct points with newlines (no bullet characters).
- State facts directly; no meta-commentary like "this document discusses".
- If there is nothing meaningful to summarize, return an empty string.`;

    const prompt = extracted
      .map(
        (item) =>
          `<attachment name="${item.filename}">\n${item.text}\n</attachment>`,
      )
      .join("\n\n");

    const modelOptions = getModelForUseCase(
      emailAccount.user,
      LlmUseCase.DigestAttachmentSummary,
    );

    const generateObject = createGenerateObject({
      emailAccount,
      label: "Summarize digest attachment",
      modelOptions,
      promptHardening: { trust: "untrusted", level: "compact" },
    });

    const response = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema,
    });

    const summary = response.object.summary?.trim();
    if (!summary) return null;

    const label =
      extracted.length === 1
        ? `📎 ${extracted[0].filename}`
        : `📎 ${extracted.length} attachments`;
    return `${label}: ${summary}`;
  } catch (error) {
    logger.error("Failed to summarize digest attachments", { error });
    return null;
  }
}
