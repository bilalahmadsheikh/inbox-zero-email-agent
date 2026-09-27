import { getEmailForLLM } from "@/utils/get-email-from-message";
import { internalDateToDate } from "@/utils/date";
import type { ParsedMessage } from "@/utils/types";

// The message being replied to is the single most important input to a draft.
// It previously got 2000 characters - less than the 4000 the chat readEmail
// tool gives the same email merely to display it - so a long email was answered
// from roughly its first third.
export const LATEST_MESSAGE_MAX_CHARS = 4000;

// Older messages share one budget instead of each getting a flat cap. A short
// thread then keeps real context, while a long one spends what it has on the
// recent messages that matter rather than giving all thirty a useless sliver.
export const THREAD_HISTORY_TOTAL_CHARS = 6000;
const HISTORY_MESSAGE_MAX_CHARS = 1500;
// Every message stays in the prompt even once the budget is spent: dropping
// messages silently is the failure this module exists to fix.
const HISTORY_MESSAGE_MIN_CHARS = 300;

// Serialization truncates a second time. Keeping this at the largest
// collection cap means this layer never cuts below what the budget allowed;
// when the two drifted, raising one alone did nothing.
export const DRAFT_MESSAGE_SERIALIZATION_MAX_CHARS = LATEST_MESSAGE_MAX_CHARS;

const TRUNCATION_NOTICE =
  "\n\n[This message was truncated and continues beyond what is shown here.]";

/**
 * Builds the thread messages a draft is written from, giving the message being
 * replied to a real budget and telling the model when it is seeing a partial
 * message rather than leaving it to answer half an email confidently.
 */
export function buildDraftThreadMessages(threadMessages: ParsedMessage[]) {
  const historyBudgets = allocateHistoryBudgets(threadMessages.length - 1);

  return threadMessages.map((message, index) => {
    const isLatest = index === threadMessages.length - 1;
    const maxChars = isLatest
      ? LATEST_MESSAGE_MAX_CHARS
      : historyBudgets[index];

    // Collected uncapped so truncation happens here, where the notice can be
    // attached; getEmailForLLM would cut silently.
    const email = getEmailForLLM(message, {
      maxLength: 0,
      extractReply: true,
      removeForwarded: false,
      includeLinkUrls: true,
      includeImageAltText: true,
    });

    return {
      date: internalDateToDate(message.internalDate),
      threadId: message.threadId,
      ...email,
      content: truncateWithNotice(email.content, maxChars),
    };
  });
}

function truncateWithNotice(content: string, maxChars: number) {
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}${TRUNCATION_NOTICE}`;
}

function allocateHistoryBudgets(historyCount: number): number[] {
  const budgets = new Array<number>(Math.max(historyCount, 0)).fill(
    HISTORY_MESSAGE_MIN_CHARS,
  );
  let remaining = THREAD_HISTORY_TOTAL_CHARS;

  // Newest first: recent context is worth more than the top of a long thread.
  for (let index = budgets.length - 1; index >= 0; index--) {
    const budget = Math.min(
      HISTORY_MESSAGE_MAX_CHARS,
      Math.max(remaining, HISTORY_MESSAGE_MIN_CHARS),
    );
    budgets[index] = budget;
    remaining = Math.max(0, remaining - budget);
  }

  return budgets;
}
