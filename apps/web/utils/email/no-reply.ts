// Local parts that mark an address as send-only. Used both to keep
// conversation rules off automated mail and to keep unreachable addresses out
// of recipient lists.
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

export function isNoReplyAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  return NO_REPLY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
