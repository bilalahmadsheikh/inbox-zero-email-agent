import { z } from "zod";

// Attachment kinds we can currently extract text from (PDF, Word .docx, plain
// text). Adding spreadsheets/images/PowerPoint needs real extraction support,
// not just a toggle, so those are intentionally not options here.
export const ATTACHMENT_FILE_TYPES = ["pdf", "word", "text"] as const;
export type AttachmentFileType = (typeof ATTACHMENT_FILE_TYPES)[number];

export const DEFAULT_ATTACHMENT_MAX_SIZE_MB = 25;

export const attachmentSettingsSchema = z.object({
  // undefined = all supported types are read
  fileTypes: z.array(z.enum(ATTACHMENT_FILE_TYPES)).optional(),
  maxSizeMb: z.number().min(1).max(50).optional(),
  // Sender emails or bare domains: always read / never read attachments from.
  // Elements are cleaned (trim/lowercase/dedupe/drop-empty) by normalizeList, so
  // the schema itself stays lenient to tolerate imperfect stored values.
  allowSenders: z.array(z.string()).max(100).optional(),
  denySenders: z.array(z.string()).max(100).optional(),
  // Skip attachments whose file name contains any of these (case-insensitive).
  nameExclusions: z.array(z.string()).max(50).optional(),
});
export type AttachmentSettings = z.infer<typeof attachmentSettingsSchema>;

export type ResolvedAttachmentSettings = {
  fileTypes: AttachmentFileType[];
  maxSizeBytes: number;
  allowSenders: string[];
  denySenders: string[];
  nameExclusions: string[];
};

export function resolveAttachmentSettings(
  raw: unknown,
): ResolvedAttachmentSettings {
  const parsed = attachmentSettingsSchema.safeParse(raw ?? {});
  const settings = parsed.success ? parsed.data : {};
  return {
    fileTypes: settings.fileTypes ?? [...ATTACHMENT_FILE_TYPES],
    maxSizeBytes:
      (settings.maxSizeMb ?? DEFAULT_ATTACHMENT_MAX_SIZE_MB) * 1024 * 1024,
    allowSenders: normalizeList(settings.allowSenders),
    denySenders: normalizeList(settings.denySenders),
    nameExclusions: normalizeList(settings.nameExclusions),
  };
}

const MIME_TO_FILE_TYPE: Record<string, AttachmentFileType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "word",
  "text/plain": "text",
};

export function attachmentMimeToFileType(
  mimeType: string,
): AttachmentFileType | null {
  return MIME_TO_FILE_TYPE[mimeType] ?? null;
}

// Matches a sender address against a list of full emails or bare domains.
// A bare domain also matches its subdomains (e.g. "acme.com" matches
// "mail.acme.com").
export function senderMatchesList(
  fromAddress: string,
  patterns: string[],
): boolean {
  const address = fromAddress.trim().toLowerCase();
  if (!address || patterns.length === 0) return false;
  const domain = address.split("@")[1] ?? "";
  return patterns.some((pattern) => {
    if (pattern.includes("@")) return address === pattern;
    return !!domain && (domain === pattern || domain.endsWith(`.${pattern}`));
  });
}

function normalizeList(values: string[] | undefined): string[] {
  if (!values) return [];
  return [
    ...new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  ];
}
