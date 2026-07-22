import { z } from "zod";

const messageSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    textPlain: z.string().optional(),
    textHtml: z.string().optional(),
    date: z.string(),
  })
  .refine((data) => data.textPlain || data.textHtml, {
    message: "At least one of textPlain or textHtml is required",
  });

export const generateReplySchema = z.object({
  messages: z.array(messageSchema),
});

export type GenerateReplySchema = z.infer<typeof generateReplySchema>;

// Reply Zero on-demand draft generation. The server fetches the thread itself,
// decides reply vs follow-up nudge from the latest message, and applies an
// optional user instruction.
export const generateReplyDraftSchema = z.object({
  threadId: z.string(),
  instruction: z.string().trim().max(2000).optional(),
});

export type GenerateReplyDraftSchema = z.infer<typeof generateReplyDraftSchema>;
