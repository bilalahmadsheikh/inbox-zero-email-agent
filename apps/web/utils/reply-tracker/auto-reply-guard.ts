import type { DraftReplyConfidence } from "@/generated/prisma/enums";
import { meetsDraftReplyConfidenceRequirement } from "@/utils/ai/reply/draft-confidence";
import { internalDateToDate } from "@/utils/date";
import { extractEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import { isLikelySendOnlyAddress } from "@/utils/email/no-reply";
import type { ParsedMessage } from "@/utils/types";

// One automatic reply per thread per window. Header checks only see what the
// sender chose to declare, and Outlook exposes none of them, so this is the
// provider-independent guarantee against two automated systems replying to
// each other indefinitely. A genuine follow-up inside the window still gets a
// reply: it arrives as a draft.
export const AUTO_REPLY_THREAD_WINDOW_HOURS = 24;

// Rules also run over mail that is not new: the onboarding pass processes
// recent inbox history, bulk runs process a chosen range, and a webhook backlog
// after an outage arrives late. Sending an automatic reply to a days-old email
// the user may have handled long ago is never what they meant, so anything
// older than this becomes a draft. Age is read from the message itself, so this
// covers every such path without each caller having to remember to opt out.
export const AUTO_REPLY_MAX_MESSAGE_AGE_HOURS = 24;

// Account-wide ceiling. The thread cap stops loops inside one conversation;
// this bounds the damage when a rule matches far more mail than intended and
// would otherwise answer hundreds of threads before anyone noticed.
export const AUTO_REPLY_DAILY_LIMIT = 50;

export type AutoReplyBlockReason =
  | "disabled"
  | "self_sent"
  | "automated_sender"
  | "mailing_list"
  | "send_only_sender"
  | "reply_to_mismatch"
  | "stale_message"
  | "already_replied"
  | "low_confidence"
  | "thread_limit"
  | "daily_limit";

/**
 * Decides whether a reply the AI wrote may be SENT without the user seeing it.
 * Returns null to allow the send, otherwise the reason it must become a draft.
 * Every block degrades to a draft rather than to nothing, so a false positive
 * costs the user one click and a false negative is what these checks prevent.
 */
export function getAutoReplyBlockReason({
  message,
  userEmail,
  autoReplyEnabled,
  autoReplyConfidence,
  draftConfidence,
  hasRecentAutoReplyInThread,
  autoRepliesInLastDay,
  userRepliedSinceMessage,
  now = new Date(),
}: {
  message: Pick<ParsedMessage, "headers" | "internalDate">;
  userEmail: string;
  autoReplyEnabled: boolean;
  autoReplyConfidence: DraftReplyConfidence;
  draftConfidence: DraftReplyConfidence | null;
  hasRecentAutoReplyInThread: boolean;
  autoRepliesInLastDay: number;
  userRepliedSinceMessage: boolean;
  now?: Date;
}): AutoReplyBlockReason | null {
  if (!autoReplyEnabled) return "disabled";

  const headers = message.headers;
  const sender = extractEmailAddress(headers.from || "").toLowerCase();

  if (sender && sender === userEmail.trim().toLowerCase()) return "self_sent";
  if (isAutomatedMessage(headers)) return "automated_sender";
  if (isMailingListMessage(headers)) return "mailing_list";
  if (!sender || isLikelySendOnlyAddress(sender)) return "send_only_sender";
  if (hasMismatchedReplyTo(headers, sender)) return "reply_to_mismatch";

  const messageDate = internalDateToDate(message.internalDate, {
    fallbackToNow: false,
  });
  if (
    Number.isNaN(messageDate.getTime()) ||
    now.getTime() - messageDate.getTime() >
      AUTO_REPLY_MAX_MESSAGE_AGE_HOURS * 60 * 60 * 1000
  ) {
    return "stale_message";
  }

  if (userRepliedSinceMessage) return "already_replied";

  if (
    !meetsDraftReplyConfidenceRequirement({
      draftConfidence,
      minimumConfidence: autoReplyConfidence,
    })
  ) {
    return "low_confidence";
  }

  if (hasRecentAutoReplyInThread) return "thread_limit";
  if (autoRepliesInLastDay >= AUTO_REPLY_DAILY_LIMIT) return "daily_limit";

  return null;
}

function isAutomatedMessage(headers: ParsedMessage["headers"]) {
  // RFC 3834: any value other than "no" marks the message as machine-sent,
  // including other people's out-of-office replies.
  const autoSubmitted = headers["auto-submitted"]?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;

  if (headers["x-autoreply"] || headers["x-autorespond"]) return true;

  const precedence = headers.precedence?.trim().toLowerCase();
  if (precedence && ["auto_reply", "bulk", "junk"].includes(precedence)) {
    return true;
  }

  // Exchange's way of asking not to be auto-replied to.
  const suppress = headers["x-auto-response-suppress"]?.toLowerCase() ?? "";
  return ["all", "autoreply", "oof"].some((value) => suppress.includes(value));
}

function isMailingListMessage(headers: ParsedMessage["headers"]) {
  if (headers["list-id"] || headers["list-unsubscribe"]) return true;
  return headers.precedence?.trim().toLowerCase() === "list";
}

// A reply goes to Reply-To when it is set. When that points at a different
// domain from the sender, an automatic reply would be delivered somewhere the
// user never chose - the shape of a spoofed "From: your boss" email. Plenty of
// legitimate mail does this too, which is why it becomes a draft, not a block.
function hasMismatchedReplyTo(
  headers: ParsedMessage["headers"],
  sender: string,
) {
  const replyTo = extractEmailAddress(headers["reply-to"] || "").toLowerCase();
  if (!replyTo || replyTo === sender) return false;
  return getDomain(replyTo) !== getDomain(sender);
}

function getDomain(address: string) {
  return address.split("@")[1] ?? "";
}

/**
 * Whether the user has sent a message in the thread after `since`. Shared by
 * the send-now path and the delayed-send executor so both answer the question
 * the same way.
 */
export async function hasUserRepliedSince({
  client,
  threadId,
  userEmail,
  since,
}: {
  client: EmailProvider;
  threadId: string;
  userEmail: string;
  since: Date;
}) {
  const normalizedUserEmail = userEmail.trim().toLowerCase();
  const messages = await client.getThreadMessages(threadId);

  return messages.some(
    (message) =>
      extractEmailAddress(message.headers.from || "").toLowerCase() ===
        normalizedUserEmail &&
      internalDateToDate(message.internalDate).getTime() > since.getTime(),
  );
}
