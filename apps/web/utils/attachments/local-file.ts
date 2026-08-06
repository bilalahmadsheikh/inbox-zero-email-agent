import type { Attachment } from "@/utils/types/mail";

// Pre-encoding size. Base64 inflates the payload by roughly a third, so the
// limit is checked against the file as picked, not as sent.
export const MAX_ATTACHMENT_MB = 10;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

// String.fromCharCode takes its bytes as arguments, so a whole large file in
// one call overflows the argument limit and throws. Chunking is what keeps
// large attachments working at all.
const ENCODE_CHUNK_SIZE = 8192;

export function isWithinAttachmentLimit(sizeInBytes: number): boolean {
  return sizeInBytes <= MAX_ATTACHMENT_BYTES;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += ENCODE_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + ENCODE_CHUNK_SIZE));
  }

  return btoa(binary);
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  const buffer = await file.arrayBuffer();

  return {
    filename: file.name,
    content: bytesToBase64(new Uint8Array(buffer)),
    // Browsers leave type empty for unrecognised extensions; mail transport
    // needs something, and octet-stream is the neutral fallback.
    contentType: file.type || "application/octet-stream",
  };
}
