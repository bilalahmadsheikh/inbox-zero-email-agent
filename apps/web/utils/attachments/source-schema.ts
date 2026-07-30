import { z } from "zod";
import { AttachmentSourceType } from "@/generated/prisma/enums";

export const attachmentSourceInputSchema = z.object({
  driveConnectionId: z.string(),
  name: z.string().min(1),
  sourceId: z.string(),
  sourcePath: z.string().nullish(),
  type: z.nativeEnum(AttachmentSourceType),
});
export type AttachmentSourceInput = z.infer<typeof attachmentSourceInputSchema>;

export const selectedAttachmentSchema = z.object({
  driveConnectionId: z.string(),
  fileId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  // Folder path, shown on the confirmation card so two files with the same name
  // are still tellable apart at the moment the user approves the send.
  path: z.string().nullish(),
  reason: z.string().nullish(),
});
export type SelectedAttachment = z.infer<typeof selectedAttachmentSchema>;
