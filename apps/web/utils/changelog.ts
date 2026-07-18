// Single source of truth for the in-app version badge and the /changelog
// page. Every change batch adds a new entry at the TOP with the version
// bumped by 0.1 (1.9 rolls over to 2.0) and plain-language notes.
export type ChangelogEntry = {
  version: string;
  date: string;
  notes: string[];
};

export const changelog: ChangelogEntry[] = [
  {
    version: "1.7",
    date: "2026-07-18",
    notes: [
      'Fixed recurring "chained" sends: a request like "send 5 messages one minute apart" now correctly sets up the whole chain starting immediately, instead of going out once as a single email. A start time is no longer required for a recurring chain.',
    ],
  },
  {
    version: "1.6",
    date: "2026-07-17",
    notes: [
      'Chat now remembers scheduling requests from earlier in the same conversation — asking to "do all of this" keeps the recurrence and timing you already described, still verified against your real messages.',
      'One-time "cancel if they reply": scheduled chains can stop automatically when the recipient replies, with no permanent rule involved. Toggle it on the confirmation card; flagged chains show a "Stops on reply" badge on the Scheduled tab.',
      "Chat completes every part of a multi-step request in order, and recovers when a rule name is already taken instead of giving up.",
      "Adding send, reply, forward, or webhook actions to an existing rule now asks for confirmation, the same as creating such a rule.",
      "Sender-wide cleanups (bulk archive, unsubscribe) prepared in chat now run only after you approve a confirmation card listing the exact senders.",
      "Emails and drafts composed in chat automatically end with your configured signature — no more placeholder sign-offs.",
      "The confirmation card lets you edit the recipient, CC, BCC, and subject before sending.",
      "Sending a chat-drafted email now removes the leftover draft, and rewrites replace the old draft instead of piling up copies.",
      "Scheduled email reliability: cancelling is now race-proof even mid-send, rescheduling a recurring reminder works from any occurrence, and the queue shows recurrence details.",
      "New changelog page (this one), linked from the version badge.",
    ],
  },
  {
    version: "1.5",
    date: "2026-07-14",
    notes: [
      "Priority triage tiers (Urgent / Important / FYI) with a one-line AI reason for every processed email, plus optional Gmail labels / Outlook categories.",
      "Scheduled sends with recurring chains, thread-aware follow-ups, a schedule time picker, and the Scheduled tab with history.",
      "Server-verified recurrence: chat can only set repeats you actually asked for.",
      "Landing page layout fixes and a cleaner sidebar with account controls in one menu.",
    ],
  },
];

export const APP_VERSION = changelog[0].version;
