# Deliberate Cost Increases

Some things in this codebase cost more to run than the obvious implementation
would. Each one is here on purpose. This document records what they are, what
they cost, and why the cost was accepted — so that a future contributor
reviewing a bill, or looking for something to trim, can tell a considered
trade-off from an accident.

**Add an entry here whenever you merge a change that spends more per request,
per user, or per background run than the straightforward version would.** That
includes extra model calls, extra database queries on hot paths, retries,
background passes, and anything that turns one unit of work into N. State the
reason in terms of what goes wrong without it. An entry that cannot name a
concrete failure it prevents is describing a cost that should be removed
instead.

Costs fall into two currencies, and they are not interchangeable:

- **Model spend** — measured in extra LLM calls. Elastic; scales with money.
- **Postgres connection slots** — the scarcest resource in the app, capped at
  `DATABASE_POOL_MAX ?? 5` per instance. Not elastic: when it runs out, requests
  fail with `P2037` for everyone on that instance. See the "Database
  Connections" section of `AGENTS.md`.

Spending model tokens to protect connection slots is usually a good trade.
Spending connection slots to save tokens is usually not.

---

## Model spend

### Sender-wide intent verification

**What it costs:** one extra `economy`-tier call every time the chat assistant
calls `manageInbox` with a sender-wide action (`bulk_archive_senders`,
`bulk_trash_senders`, unsubscribe). The call is small — the user's messages from
one conversation, and a boolean back.

**Where:** `utils/ai/assistant/verify-sender-wide-intent.ts`, called from the
`isSenderAction` branch of `utils/ai/assistant/chat-inbox-tools.ts`.

**Why it was implemented:** sender-wide actions do not touch the emails under
discussion — they touch every email the sender has ever sent, including mail the
assistant had just described as important. The model has been observed widening
a narrow request ("archive the rest of these") into that far larger action,
because it had just summarised the inbox grouped by sender and the sender-wide
tool was the nearest match to what it wanted to do.

The tool description was tightened against exactly this in April (`17aaaf276`)
and again in July (`d86bbd51b`). It happened again after both. That is the
signal that mattered: a description tells the model what it *should* do, and
works well for "the model does not know X." It does not work for "the model
should have checked," because the model doing the checking is the one that is
already wrong. The verification is a separate call with no stake in the first
one's conclusion.

The check fails toward the narrower action — no user messages available, a
verification error, or a "no" all block the sender-wide path and leave the
thread-level tools available. A false negative costs the user one extra
instruction. A false positive costs them their mail history.

### Recurrence and scheduled-send verification

**What it costs:** one extra `economy`-tier call before the assistant sets up a
recurring send or a scheduled send.

**Where:** `utils/ai/assistant/verify-recurrence-request.ts`
(`verifyRecurrenceRequest`, `verifyScheduledSendIntent`).

**Why it was implemented:** the same shape of problem, and the pattern the
sender-wide check was modelled on. "Send this every Monday" and "send this on
Monday" differ by one word and by an unbounded number of emails to the
recipient. A model that has mis-read that once will keep mis-reading it on every
subsequent fire, with no user in the loop to catch it. Verifying against the
user's own words costs one small call at setup time.

### Chat compaction

**What it costs:** one `economy`-tier call whenever a conversation crosses
`COMPACTION_TOKEN_THRESHOLD` (80k estimated tokens), plus the memory-extraction
call that accompanies it.

**Where:** `utils/ai/assistant/compact.ts`.

**Why it was implemented:** it is cheaper than the alternative. Without it, long
conversations either hit the context limit and fail outright, or carry their
full history into every subsequent turn — where the same tokens are re-sent on
each message, at premium-tier rates, for the rest of the conversation. One
economy call that shrinks the history pays for itself within a few turns.

### Draft thread context

**What it costs:** more input tokens per drafted reply, on the `draft` tier
rather than `economy`. The message being replied to went from 2,000 to 4,000
characters, and thread history from a flat 500 per message to a shared 6,000
budget allocated newest-first.

**Where:** `utils/ai/reply/draft-thread-context.ts`, used by
`utils/reply-tracker/generate-draft.ts` and `utils/follow-up/generate-draft.ts`.

**Why it was implemented:** the limits are a ceiling, not an allocation, so an
email shorter than the cap costs exactly what it did before. The increase lands
only on emails long enough to have been truncated already - which are precisely
the ones that were producing drafts that answered the first third of the
question and stopped. The old setting saved tokens by generating replies the
user had to rewrite, which is the most expensive kind of cheap.

The drafting path had the smallest budget of any path in the app: the chat
`readEmail` tool gives 4,000 characters to *display* an email, and the manual
generate-reply action 3,000, while the automatic path whose output is a real
outgoing email got 2,000. Matching `readEmail` is the change.

Two caps had to move together. `getEmailListPrompt` truncates a second time at
serialization, and while collection was the tighter of the two that layer was
inert; raising collection alone would have been silently re-capped. Both now
read the same constant.

### Attachment and digest summarisation

**What it costs:** one `economy`-tier call per attachment or digest item —
`DigestAttachmentSummary`, `IncomingAttachmentContext`,
`DraftAttachmentSelection`.

**Why it was implemented:** these are the feature, not overhead on it. They are
listed here because they scale with mail volume rather than with user count,
which makes them the entries most likely to surprise someone reading a bill: a
user who receives many attachments costs materially more than one who does not.
Keep them on the `economy` tier.

---

## Database load

### Connection-slot retries

**What it costs:** a query that hits `P2037` is retried up to `MAX_ATTEMPTS`
(3) times, with `BASE_DELAY_MS * attempt` plus jitter between attempts. The cost
is not CPU — it is that each retry holds its attempt open longer, against the
resource that was already exhausted.

**Where:** `utils/prisma-connection-retry.ts`. Must stay **last** in the
`$extends` chain.

**Why it was implemented:** slot exhaustion is usually brief and bursty, and a
retry converts a user-visible 500 into a slower success. But this entry exists
mainly as a warning: the retry relieves the symptom while adding to the cause.
`P2037` in the logs means something is issuing too many queries. Treat it as a
signal to find that query, not as a transient to be tuned away by raising the
retry count.

### Queries on hot server components

**What it costs:** one query per page view, per user, on `/automation`,
`/assistant`, and `/mail` — against a pool of 5 per instance.

**Why this is called out:** there is no single implementation to point at, which
is the problem. Any query added unconditionally to one of these server
components multiplies by every page view in the app. Gate it behind a cheaper
check, or cache it. And never let one of these redirect to a route that re-runs
the same check: a server component that queries and then redirects to itself is
an unbounded query loop from a single browser tab, which can starve slots for
every user on that instance.

---

## Deciding whether a new cost belongs

A cost is worth paying when it prevents a failure that is **irreversible,
silent, or repeating**:

- *Irreversible* — sender-wide archive, deletion, a real unsubscribe request.
- *Silent* — the user cannot tell it went wrong until much later.
- *Repeating* — a recurring send that will make the same mistake every week.

A cost is not worth paying to catch a failure the user would notice and correct
in the next message. When the choice is close, prefer the check that fails toward
the smaller action, and make the failure mode explicit in the code comment so
the next reader knows which way it was meant to break.
