import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { TriageTier } from "@/generated/prisma/enums";
import { createGenerateObject } from "@/utils/llms";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { getUserInfoPrompt } from "@/utils/ai/helpers";
import type { Logger } from "@/utils/logger";
import type { StoredTriage } from "./stored-triage";

export type CatchupEmail = {
  email: EmailForLLM;
  // Reused tier from when the email was processed by rules; when present the
  // model is told to keep it and only untiered emails are freshly triaged.
  knownTriage?: StoredTriage;
};

const TIER_VALUES = [
  TriageTier.URGENT,
  TriageTier.IMPORTANT,
  TriageTier.FYI,
] as const;

const schema = z.object({
  summary: z
    .string()
    .describe(
      "A 2-4 sentence catch-up briefing written to the user, urgency-first: lead with what needs action, then what matters, then a one-line note on the rest.",
    ),
  items: z
    .array(
      z.object({
        index: z
          .number()
          .int()
          .describe("The index of the email from the provided list."),
        tier: z
          .enum(TIER_VALUES)
          .describe(
            "URGENT: needs action/attention right away. IMPORTANT: deserves attention soon. FYI: no action needed.",
          ),
        reason: z
          .string()
          .describe(
            "One-line reason (15 words max), specific to this email, written for the user.",
          ),
      }),
    )
    .describe("One entry per email, in the same order as provided."),
});

export type CatchupBriefingResult = z.infer<typeof schema>;

// Ranked catch-up: triages a batch of unread emails into priority tiers with a
// one-line reason each, and writes an overall urgency-first summary. One LLM
// call for the whole batch. Emails that already carry a tier (from rule
// processing) keep it — only untiered emails are freshly triaged.
export async function generateCatchupBriefing({
  emailAccount,
  emails,
  logger,
}: {
  emailAccount: EmailAccountWithAI & { name: string | null };
  emails: CatchupEmail[];
  logger: Logger;
}): Promise<CatchupBriefingResult | null> {
  if (emails.length === 0) return { summary: "", items: [] };

  const system = `You are an assistant that produces a "what you missed" catch-up briefing for someone returning to their inbox after time away.
You are given a numbered list of unread emails. Some already show a priority tier — that tier is authoritative, so DO NOT re-classify those or include them in your items list. Do two things:
1. For each email that does NOT already show a tier, classify it into a priority tier with a one-line reason (15 words max), specific to that email and written for the user:
   - URGENT: needs the user's action or attention right away (hard deadlines, emergencies, blocking or time-critical requests).
   - IMPORTANT: matters and deserves attention soon (real work, decisions, questions from people they know).
   - FYI: no action needed (updates, newsletters, marketing, receipts, automated notifications).
2. Write an overall summary (2-4 sentences) ordered by urgency, considering ALL emails including the pre-tiered ones: what needs action first, then what matters, then a brief note on the rest. Group related items (e.g. "three newsletters") instead of listing everything.
Return an item ONLY for each email that did not already show a tier, using the provided index. Do not invent emails or indexes.`;

  const prompt = `<emails>
${emails
  .map(({ email, knownTriage }, index) => {
    const tierAttr = knownTriage ? ` tier="${knownTriage.tier}"` : "";
    return `<email index="${index}"${tierAttr}>\n${stringifyEmailSimple(email)}\n</email>`;
  })
  .join("\n")}
</emails>

${getUserInfoPrompt({ emailAccount })}`;

  try {
    const modelOptions = getModelForUseCase(
      emailAccount.user,
      LlmUseCase.CatchupBriefing,
    );

    const generateObject = createGenerateObject({
      emailAccount,
      label: "Catch-up briefing",
      modelOptions,
      promptHardening: { trust: "untrusted", level: "compact" },
    });

    const response = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema,
    });

    return response.object;
  } catch (error) {
    logger.error("Failed to generate catch-up briefing", { error });
    return null;
  }
}
