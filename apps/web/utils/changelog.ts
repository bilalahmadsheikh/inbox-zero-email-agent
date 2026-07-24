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
    version: "2.9",
    date: "2026-07-24",
    notes: [
      "The assistant no longer fails silently: if a reply gets cut off because it reached its length limit, it now says so and suggests continuing or splitting the request; and if a chat request errors out, it shows a clear message instead of stopping with nothing.",
      'You can now ask the assistant to move emails by attachment name into a folder — e.g. "move all emails with a CV or profile attachment into a CVs folder." It creates the folder first, then finds emails by their attachment file names (which regular search couldn\'t match) and moves them in. On Gmail, the assistant can now also search attachment file names directly with filename:.',
    ],
  },
  {
    version: "2.8",
    date: "2026-07-24",
    notes: [
      "Bulk delete and archive by sender are dramatically faster. Gmail now removes emails in large batches instead of one conversation at a time, and Outlook sends its requests in parallel — with several senders processed at once.",
      "Bulk cleanups now tell you how many emails were removed and let you retry any senders that failed, instead of finishing silently.",
      'You can now ask the assistant to delete every email from a sender — it moves them all to trash (after you confirm the card), instead of only the handful currently on screen. This mirrors the existing "archive all from sender" action.',
      "When you ask the assistant to show or count all mail from a sender, it can pull more messages per search so it surfaces more of them at once.",
    ],
  },
  {
    version: "2.7",
    date: "2026-07-23",
    notes: [
      "Reply Zero drafts for you: opening Reply on an incoming email now writes a ready-to-edit draft automatically, and Waiting still writes a follow-up — both editable before you send.",
      'Ask AI in Reply Zero: a new prompt box lets you tell the AI how to write the reply or nudge (e.g. "accept and ask about the start date" or "politely decline") and regenerate as many times as you like.',
      'New global setting "Read attachments before drafting": turn it on to have every AI draft and reply read supported documents (PDF, Word) first, everywhere including Reply Zero. You can still enable attachment reading for a single rule instead.',
    ],
  },
  {
    version: "2.6",
    date: "2026-07-23",
    notes: [
      "Attachment-aware drafts now recognize when part of a lengthy document could not be read, clearly mark the missing section, and avoid implying that the entire document was reviewed.",
    ],
  },
  {
    version: "2.5",
    date: "2026-07-22",
    notes: [
      "Fixed a case where an auto-reply rule could be silently skipped: when more than one rule matched the same email, a rule that sends a reply is no longer mistaken for a draft and dropped — it always sends.",
      "Attachment-aware rules read large documents faster by processing several sections of a document at once (bounded to stay gentle on the AI service), with no change to what's extracted.",
    ],
  },
  {
    version: "2.4",
    date: "2026-07-22",
    notes: [
      "Attachment reading is now controlled per automation rule. Your regular draft and reply rules leave attachments untouched; ask Assistant to create an attachment-aware rule when you want incoming documents read before a response is prepared.",
    ],
  },
  {
    version: "2.3",
    date: "2026-07-22",
    notes: [
      "Attachment-aware automations: rules created in Assistant can read supported documents from incoming emails before drafting or replying when attachment reading is enabled on that rule. Small files are read directly, while lengthy PDFs and Word documents automatically switch to section-by-section processing so relevant facts from later pages can inform the response.",
      "Automatic replies now use the same grounded drafting pipeline as saved drafts, including document context and confidence checks.",
    ],
  },
  {
    version: "2.2",
    date: "2026-07-22",
    notes: [
      "Reply Zero loads much faster: the To Reply and Waiting lists now render straight from your saved data instead of re-fetching every conversation from your mail provider one by one. Older items still fill in automatically the first time they're opened.",
    ],
  },
  {
    version: "2.1",
    date: "2026-07-21",
    notes: [
      'Reply and Nudge now work in Reply Zero for Outlook accounts too: the To Reply tab opens a reply composer and the Waiting tab opens a follow-up, sent straight from the app — no more "reply in your mail client" message.',
    ],
  },
  {
    version: "2.0",
    date: "2026-07-21",
    notes: [
      "Reply Zero opens quickly again: the page now loads its heavy email viewer only when you open a conversation, so the list appears right away.",
      "Consistent priorities: the catch-up briefing now reuses the priority already assigned to each email when it arrived, instead of re-judging it — so Urgent/Important/FYI mean the same thing across your inbox, digest, and catch-up.",
      "No double-chasing: if you've set up an automatic scheduled follow-up on a thread, the app no longer also nudges you to chase it by hand — the automation takes precedence.",
    ],
  },
  {
    version: "1.9",
    date: "2026-07-19",
    notes: [
      "Attachment summaries in your digest: PDF and Word attachments (contracts, decks, financial docs) on digested emails are now distilled to their essentials and shown alongside the email summary.",
      '"What you missed" catch-up briefing: a new on-demand endpoint (GET /api/devaicon/catchup?since=…) fetches unread mail since a time you specify, ranks it by urgency (Urgent / Important / FYI) with a one-line reason each, and writes an urgency-first summary — optionally delivered to your email or messaging channel.',
    ],
  },
  {
    version: "1.8",
    date: "2026-07-19",
    notes: [
      "Reply reminders in your digest: threads awaiting your reply, and mail you're waiting on others to answer, now resurface in the daily digest (email and messaging channels) before they slip — using your existing follow-up day settings.",
      "Waiting-on-others chase nudges: overdue threads you're waiting on link straight to the Reply Zero 'Waiting' tab to follow up, and an auto-draft is prepared when auto-draft is enabled.",
      "Reply Zero now appears in the sidebar for Outlook accounts too, not just Gmail. (Replying from within the app remains Gmail-only for now; Outlook opens in your mail client.)",
      "The version badge changelog link now opens the in-app changelog instead of an external site.",
    ],
  },
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
