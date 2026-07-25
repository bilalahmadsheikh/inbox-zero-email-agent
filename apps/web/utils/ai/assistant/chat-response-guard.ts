import { isToolErrorHiddenFromUser } from "./tool-error-visibility";

const TOOL_FAILURE_WARNING =
  "Some tool calls failed during this request. Review the failed action cards in this message before relying on the summary.";

// Shown when the model stops because it hit its output token limit
// (finishReason "length"), so the user knows the reply was cut off rather than
// silently truncated.
export const TOKEN_LIMIT_WARNING =
  "⚠️ I reached my response length limit and stopped early, so this reply may be incomplete. Ask me to continue, or split this into smaller steps.";

// Shown when the chat request fails outright instead of failing silently.
export const CHAT_ERROR_MESSAGE =
  "⚠️ Something went wrong and I couldn't finish this response. This can happen when a request is too large or the AI service is busy — please try again, or break it into smaller steps.";

export function getToolFailureWarning(
  message:
    | {
        parts?: unknown[];
      }
    | null
    | undefined,
) {
  const parts = message?.parts;
  if (!parts?.length) return null;

  return parts.some((part) => {
    if (!isRecord(part)) return false;
    if (typeof part.type !== "string" || !part.type.startsWith("tool-")) {
      return false;
    }

    return Boolean(getUserVisibleToolFailureMessage(part.output));
  })
    ? TOOL_FAILURE_WARNING
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getUserVisibleToolFailureMessage(output: unknown) {
  if (isToolErrorHiddenFromUser(output)) return null;

  const failureMessage = getToolFailureMessage(output);
  return failureMessage;
}

function getToolFailureMessage(output: unknown): string | null {
  if (!isRecord(output)) return null;

  if ("error" in output) {
    return toMessageString(output.error);
  }

  if (output.success === false) {
    return (
      toMessageString(output.message) ??
      toMessageString(output.reason) ??
      toMessageString(output.error) ??
      "Operation failed"
    );
  }

  return null;
}

function toMessageString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (
    isRecord(value) &&
    "message" in value &&
    typeof value.message === "string" &&
    value.message.trim().length > 0
  ) {
    return value.message;
  }
  return null;
}
