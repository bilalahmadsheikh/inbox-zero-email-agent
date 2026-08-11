import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { getEmailAccountWithAi } from "@/utils/user/get";
import type { Logger } from "@/utils/logger";

const schema = z.object({
  requestsSenderWide: z.boolean(),
});

/**
 * Sender-wide cleanup archives, trashes or unsubscribes EVERY email a sender
 * has ever sent, not the handful under discussion. A model that has just
 * summarised an inbox grouped by sender can carry a narrow "do that" onto that
 * far larger action — turning "archive the rest of these 18" into "archive
 * everything these 13 senders ever sent", including mail it had just called
 * important.
 *
 * Tool descriptions have said not to widen a thread-level request since April
 * and it still happens, so intent is judged here from the user's own messages,
 * independent of whatever the tool call claimed. Mirrors verifyRecurrenceRequest.
 */
export async function verifySenderWideIntent({
  userMessageTexts,
  emailAccountId,
  logger,
}: {
  userMessageTexts: string[];
  emailAccountId: string;
  logger: Logger;
}): Promise<boolean> {
  try {
    const emailAccount = await getEmailAccountWithAi({ emailAccountId });
    if (!emailAccount) return false;

    const system =
      "Determine whether a user's messages in one conversation ask to act on EVERY email from particular senders, as opposed to acting on a specific set of emails being discussed.";

    const prompt = `${formatUserMessages(userMessageTexts)}

Do these messages (from the same conversation, oldest first) ask to act on ALL mail from one or more senders — every email they have ever sent, including old ones not shown in the conversation?

Answer true only for requests that clearly reach beyond the emails under discussion, such as "archive everything from LinkedIn", "delete all emails from this sender", "unsubscribe from them", or "clear out my whole inbox".

Answer false when the request is about the emails already shown or found, even if it sounds sweeping in that context — "archive the rest", "clean these up", "do that", "get rid of them", "archive all of these". A short confirmation like "do that" or "yes" carries forward only what the earlier messages actually asked for.`;

    const modelOptions = getModelForUseCase(
      emailAccount.user,
      LlmUseCase.VerifySenderWideIntent,
    );

    const generateObject = createGenerateObject({
      emailAccount,
      label: "Verify sender-wide intent",
      modelOptions,
      promptHardening: { trust: "untrusted", level: "compact" },
    });

    const result = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema,
    });

    return result.object.requestsSenderWide;
  } catch (error) {
    // Failing closed keeps a verification outage from authorising the
    // destructive path; the caller falls back to the narrower action.
    logger.error("Failed to verify sender-wide intent", { error });
    return false;
  }
}

function formatUserMessages(userMessageTexts: string[]) {
  return userMessageTexts
    .map((text, index) => `Message ${index + 1}: ${text}`)
    .join("\n");
}
