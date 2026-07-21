import { z } from "zod";

// Accepts an ISO 8601 string or epoch milliseconds for `since`.
export const catchupQuerySchema = z.object({
  since: z.string().trim().min(1),
  // When present, also deliver the briefing through the account's configured
  // digest destinations (email and/or messaging channels).
  deliver: z.enum(["true", "1", "email", "channel", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type CatchupQuery = z.infer<typeof catchupQuerySchema>;

export function parseSince(since: string): Date | null {
  const asNumber = Number(since);
  const date = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(since);
  return Number.isNaN(date.getTime()) ? null : date;
}
