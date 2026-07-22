"use server";

import {
  generateReplySchema,
  generateReplyDraftSchema,
} from "@/utils/actions/generate-reply.validation";
import { aiGenerateNudge } from "@/utils/ai/reply/generate-nudge";
import { getReply, saveReply } from "@/utils/redis/reply";
import { actionClient } from "@/utils/actions/safe-action";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { SafeError } from "@/utils/error";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { emailToContentForAI } from "@/utils/ai/content-sanitizer";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { sortByInternalDate } from "@/utils/date";
import { fetchMessagesAndGenerateDraft } from "@/utils/reply-tracker/generate-draft";

export const generateNudgeReplyAction = actionClient
  .metadata({ name: "generateNudgeReply" })
  .inputSchema(generateReplySchema)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { messages: inputMessages },
    }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });

      if (!emailAccount) throw new SafeError("User not found");

      const lastMessage = inputMessages.at(-1);

      if (!lastMessage) throw new SafeError("No message provided");

      const reply = await getReply({
        emailAccountId,
        messageId: lastMessage.id,
      });

      if (reply) return { text: reply };

      const messages = inputMessages.map((msg) => ({
        ...msg,
        date: new Date(msg.date),
        content: emailToContentForAI(
          {
            textPlain: msg.textPlain,
            textHtml: msg.textHtml,
            snippet: "",
          },
          {
            includeLinkUrls: true,
            includeImageAltText: true,
          },
        ),
      }));

      const { text, attribution } = await aiGenerateNudge({
        messages,
        emailAccount,
      });
      await saveReply({
        emailAccountId,
        messageId: lastMessage.id,
        reply: text,
        confidence: DraftReplyConfidence.ALL_EMAILS,
        attribution,
      });

      return { text };
    },
  );

// Generates a ready-to-edit draft for Reply Zero from a thread id. Picks the
// right style from the latest message — a reply for an inbound email (grounded,
// reading attachments when enabled), or a follow-up nudge when the user sent
// last — and honors an optional free-text instruction from the user.
export const generateReplyDraftAction = actionClient
  .metadata({ name: "generateReplyDraft" })
  .inputSchema(generateReplyDraftSchema)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { threadId, instruction },
    }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount) throw new SafeError("User not found");

      const provider = await createEmailProvider({
        emailAccountId,
        provider: emailAccount.account.provider,
        logger,
      });

      const threadMessages = await provider.getThreadMessages(threadId);
      if (!threadMessages?.length)
        throw new SafeError("No messages found in thread");

      const sortedMessages = [...threadMessages].sort(sortByInternalDate());
      const lastMessage = sortedMessages.at(-1);
      if (!lastMessage) throw new SafeError("No messages found in thread");

      if (provider.isSentMessage(lastMessage)) {
        const messages = sortedMessages.map((message) =>
          getEmailForLLM(message, { maxLength: 3000 }),
        );
        const { text } = await aiGenerateNudge({
          messages,
          emailAccount,
          instruction,
        });
        // Nudge output is plain text; the composer converts it to HTML.
        return { text, isHtml: false };
      }

      // Inbound email: the grounded pipeline returns ready-to-render HTML.
      const draft = await fetchMessagesAndGenerateDraft(
        emailAccount,
        threadId,
        provider,
        undefined,
        logger,
        undefined,
        false,
        instruction,
      );
      return { text: draft, isHtml: true };
    },
  );
