import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { getEmailAccountWithAi } from "@/utils/user/get";
import type { Logger } from "@/utils/logger";

const schema = z.object({
  requestsRecurrence: z.boolean(),
});

/**
 * A model choosing to repeat a send can support that choice with a real
 * quote from the user's message (e.g. a scheduling time) that has nothing
 * to do with recurrence. Substring presence alone can't catch that, so this
 * asks a model to judge the full message for actual recurrence intent,
 * independent of whatever quote the tool call supplied.
 */
export async function verifyRecurrenceRequest({
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
      "Determine whether a user's messages in one conversation explicitly ask for an action to be repeated multiple times (a recurring reminder or follow-up), as opposed to a single action scheduled for one specific future time.";

    const prompt = `${formatUserMessages(userMessageTexts)}

Do these messages (from the same conversation, oldest first) explicitly ask for something to be sent, done, or repeated multiple times (e.g. "every 10 minutes", "remind them a few times", "send this 3 times", "keep following up until they reply")? A later message like "do all of this" carries forward an earlier explicit request. A single future time (e.g. "tomorrow at 9am", "in 2 hours") is NOT a recurrence request on its own.`;

    const modelOptions = getModelForUseCase(
      emailAccount.user,
      LlmUseCase.VerifyRecurrenceRequest,
    );

    const generateObject = createGenerateObject({
      emailAccount,
      label: "Verify recurrence request",
      modelOptions,
      promptHardening: { trust: "untrusted", level: "compact" },
    });

    const result = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema,
    });

    return result.object.requestsRecurrence;
  } catch (error) {
    logger.error("Failed to verify recurrence request", { error });
    return false;
  }
}

const scheduledSendIntentSchema = z.object({
  shouldBeScheduled: z.boolean(),
});

/**
 * When a message describes several emails at once, a model can copy one
 * email's sendAt onto a sibling that was meant to go out immediately. This
 * checks, for one specific email (by subject/content), whether the message
 * actually asked for *that* email to be scheduled rather than sent now —
 * independent of whatever sendAt the tool call attached to it.
 */
export async function verifyScheduledSendIntent({
  userMessageTexts,
  emailSubject,
  emailContentSnippet,
  emailAccountId,
  logger,
}: {
  userMessageTexts: string[];
  emailSubject: string;
  emailContentSnippet: string;
  emailAccountId: string;
  logger: Logger;
}): Promise<boolean> {
  try {
    const emailAccount = await getEmailAccountWithAi({ emailAccountId });
    if (!emailAccount) return false;

    const system =
      "Determine whether a user's messages in one conversation asked for one specific email, out of possibly several described, to be scheduled for a future time rather than sent immediately.";

    const prompt = `${formatUserMessages(userMessageTexts)}

<email_in_question>
Subject: ${emailSubject}
Content: ${emailContentSnippet}
</email_in_question>

The messages (from the same conversation, oldest first) may describe more than one email. Considering only what they say about the specific email above (matched by its subject/content), did the user ask for THIS email to be scheduled for a future send time? A later message like "do all of this" carries forward an earlier explicit request. If the user asked for this one to be sent now, or never asked for scheduling for this one specifically, answer false.`;

    const modelOptions = getModelForUseCase(
      emailAccount.user,
      LlmUseCase.VerifyScheduledSendIntent,
    );

    const generateObject = createGenerateObject({
      emailAccount,
      label: "Verify scheduled send intent",
      modelOptions,
      promptHardening: { trust: "untrusted", level: "compact" },
    });

    const result = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema: scheduledSendIntentSchema,
    });

    return result.object.shouldBeScheduled;
  } catch (error) {
    logger.error("Failed to verify scheduled send intent", { error });
    return false;
  }
}

function formatUserMessages(userMessageTexts: string[]) {
  return userMessageTexts
    .map((text) => `<user_message>\n${text}\n</user_message>`)
    .join("\n");
}
