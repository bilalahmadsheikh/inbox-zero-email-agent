# TEMPORARY: Cron schedules downgraded for Vercel Hobby plan

## Why

Vercel's Hobby plan only allows cron jobs to run **once per day**. Deploying
`apps/web/vercel.json` as originally configured fails with:

> Hobby accounts are limited to daily cron jobs. This cron expression
> (`* * * * *`) would run more than once per day. Upgrade to the Pro plan to
> unlock all Cron Jobs features on Vercel.

To get a deployment working now, the six schedules below were changed to
once-daily (staggered by an hour so they don't collide). This is a
**functional downgrade, not just a config formality** — automation jobs,
follow-up reminders, digests, and meeting briefs will only run once a day
instead of every 15 minutes to an hour, so those features will feel much
less responsive until this is reverted.

## Revert once on Vercel Pro

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

After restoring, delete this file.
