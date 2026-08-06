const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const MAX_REASON_LENGTH = 140;
const DEFAULT_REASON_LIMIT = 3;

export type FailureReason = { reason: string; count: number };

/**
 * Turns settled results into a short list of distinct failure causes.
 *
 * Bulk operations across this codebase count rejections and discard the reason
 * the provider gave, which leaves "3 failed" as the only thing anyone — user,
 * assistant, or maintainer — ever sees. These summaries are surfaced to the
 * model and stored in chat history, so they are deduplicated (a hundred
 * identical failures should not become a hundred prompt lines) and stripped of
 * addresses, which provider errors often echo back.
 */
export function summarizeFailureReasons(
  results: { result: PromiseSettledResult<unknown> }[],
  limit = DEFAULT_REASON_LIMIT,
): FailureReason[] {
  const counts = new Map<string, number>();

  for (const { result } of results) {
    if (result.status !== "rejected") continue;

    const reason = toSafeReason(result.reason);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Formats summarized reasons for a sentence, e.g. "cannot modify draft (2)". */
export function formatFailureReasons(reasons: FailureReason[]): string | null {
  if (!reasons.length) return null;

  return reasons
    .map(({ reason, count }) => (count > 1 ? `${reason} (${count})` : reason))
    .join("; ");
}

function toSafeReason(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  const redacted = message
    .replace(EMAIL_PATTERN, "[address]")
    .replace(/\s+/g, " ")
    .trim();

  if (!redacted) return "Unknown error";

  return redacted.length > MAX_REASON_LENGTH
    ? `${redacted.slice(0, MAX_REASON_LENGTH)}…`
    : redacted;
}
