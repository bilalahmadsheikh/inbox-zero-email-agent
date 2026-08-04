// Local parts that mark an address as send-only. Deliberately conservative:
// this drives conversation-rule filtering, where a false positive silently
// stops real mail being tracked.
const NO_REPLY_PREFIXES = [
  "noreply@",
  "no-reply@",
  "notifications@",
  "notif@",
  "info@",
  "newsletter@",
  "updates@",
  "account@",
];

// Additional local parts seen on bulk senders. Only used when choosing
// recipients, where the cost of a false positive is one address left out of a
// list the user can still override — far cheaper than mail sent into a void.
const BULK_SENDER_PREFIXES = [
  "donotreply@",
  "do-not-reply@",
  "mailer@",
  "mailer-daemon@",
  "bounce@",
  "bounces@",
  "marketing@",
  "promotions@",
  "promo@",
  "offers@",
  "deals@",
  "news@",
  "digest@",
  "alerts@",
  "alert@",
  "orders@",
  "order@",
  "receipts@",
  "billing@",
  "hello@",
  "mail@",
  "email@",
  "team@",
  "notify@",
  "reply@",
];

// Subdomains that exist to carry bulk mail. `PL@email.premierleague.com` and
// `twitch@sfmarketing.twitch.tv` are unreachable despite ordinary local parts.
const BULK_SENDER_SUBDOMAINS = [
  "email",
  "mail",
  "mailer",
  "news",
  "newsletter",
  "marketing",
  "sfmarketing",
  "notifications",
  "notification",
  "updates",
  "orders",
  "info",
  "reply",
  "e",
  "em",
];

/**
 * Deliberately does NOT lower-case: this decides whether conversation rules
 * apply to an email, and it is matched against the address exactly as the
 * caller extracted it, matching the behaviour before this check moved here.
 * Changing that would silently re-file mail. Callers that want a
 * case-insensitive test normalise first, as isLikelySendOnlyAddress does.
 */
export function isNoReplyAddress(address: string): boolean {
  return NO_REPLY_PREFIXES.some((prefix) => address.startsWith(prefix));
}

/**
 * Whether an address looks like it only ever sends, so a reply would go
 * nowhere. Wider than {@link isNoReplyAddress} because it is used to build
 * recipient lists rather than to decide how mail is filed.
 */
export function isLikelySendOnlyAddress(address: string): boolean {
  const normalized = normalize(address);
  if (!normalized) return false;

  if (isNoReplyAddress(normalized)) return true;
  if (BULK_SENDER_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  const domain = normalized.split("@")[1];
  if (!domain) return false;

  // Only the leading label counts: `news.example.com` is a bulk subdomain,
  // while `example.news` is just a domain that happens to end that way.
  const labels = domain.split(".");
  if (labels.length < 3) return false;

  return BULK_SENDER_SUBDOMAINS.includes(labels[0]);
}

function normalize(address: string) {
  return address.trim().toLowerCase();
}
