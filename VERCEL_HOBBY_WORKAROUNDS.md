# TEMPORARY: Vercel Hobby plan workarounds

Both changes below exist purely because we're on Vercel's Hobby plan.
Revert both once the project is on Pro, then delete this file.

## 1. Cron schedules downgraded to once-daily

### Why

Vercel's Hobby plan only allows cron jobs to run **once per day**. Deploying
`apps/web/vercel.json` as originally configured fails with:

> Hobby accounts are limited to daily cron jobs. This cron expression
> (`* * * * *`) would run more than once per day. Upgrade to the Pro plan to
> unlock all Cron Jobs features on Vercel.

To get a deployment working, six schedules were changed to once-daily
(staggered by an hour so they don't collide). This is a **functional
downgrade, not just a config formality** — automation jobs, follow-up
reminders, digests, and meeting briefs will only run once a day instead of
every 15 minutes to an hour, so those features will feel much less
responsive until this is reverted.

### Revert

In `apps/web/vercel.json`, restore these six entries to their original
schedules (`reasoning-retention` and `draft-cleanup` were already
once-daily and don't need to change):

| Path | Current (temporary) | Restore to |
|---|---|---|
| `/api/cron/scheduled-actions` | `0 0 * * *` | `* * * * *` |
| `/api/watch/all` | `0 1 * * *` | `0 * * * *` |
| `/api/resend/digest/all` | `0 2 * * *` | `0 * * * *` |
| `/api/follow-up-reminders` | `0 5 * * *` | `0 * * * *` |
| `/api/cron/automation-jobs` | `0 6 * * *` | `*/15 * * * *` |
| `/api/meeting-briefs` | `0 7 * * *` | `*/15 * * * *` |

## 2. QStash queue-trigger config removed from `vercel.json`

### Why

Vercel's Hobby plan caps a deployment at **12 Serverless Functions**:

> No more than 12 Serverless Functions can be added to a Deployment on the
> Hobby plan. Create a team (Pro plan) to deploy more.

The app has 172 API routes. The explicit `functions` block in
`apps/web/vercel.json` configured 5 routes with QStash `queue/v2beta`
triggers — each of those is guaranteed to be a standalone, unmergeable
function (a queue trigger can't be bundled with anything else), which was
a meaningful contributor to going over the cap. That block was removed
entirely to get under 12.

**This is a real functional loss, not just a slowdown**: those 5 routes
were how QStash delivered queued background work. Without this config,
QStash has nowhere to push jobs for:
- Follow-up reminders (per-account processing)
- AI digest generation
- Automation job execution
- Resend digest sending
- Resend summary sending

Those features will not process queued work via this path until reverted.

### Revert

Once on Pro, add this exact block back into `apps/web/vercel.json`
(as a top-level key, alongside `rewrites`/`crons`):

```json
"functions": {
  "app/api/follow-up-reminders/account/queue/route.ts": {
    "experimentalTriggers": [
      {
        "type": "queue/v2beta",
        "topic": "follow-up-reminders-account",
        "retryAfterSeconds": 60
      }
    ]
  },
  "app/api/ai/digest/queue/route.ts": {
    "experimentalTriggers": [
      {
        "type": "queue/v2beta",
        "topic": "ai-digest",
        "retryAfterSeconds": 60
      }
    ]
  },
  "app/api/automation-jobs/execute/queue/route.ts": {
    "experimentalTriggers": [
      {
        "type": "queue/v2beta",
        "topic": "automation-jobs-execute",
        "retryAfterSeconds": 60
      }
    ]
  },
  "app/api/resend/digest/queue/route.ts": {
    "experimentalTriggers": [
      {
        "type": "queue/v2beta",
        "topic": "resend-digest",
        "retryAfterSeconds": 60
      }
    ]
  },
  "app/api/resend/summary/queue/route.ts": {
    "experimentalTriggers": [
      {
        "type": "queue/v2beta",
        "topic": "resend-summary",
        "retryAfterSeconds": 60
      }
    ]
  }
}
```

After restoring both workarounds, delete this file.
