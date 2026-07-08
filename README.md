# The Inbox Intern

The Inbox Intern is an AI email operations assistant powered by Devaicon. It organizes your inbox, drafts replies in your voice, helps clean noisy subscriptions, prepares meeting context, and keeps important messages from slipping through.

## What it does

- **AI Personal Assistant:** Triage, label, archive, and draft replies from plain-English rules.
- **AI Chat:** Ask questions about your inbox and manage settings conversationally.
- **Reply Zero:** Track messages that need replies and conversations awaiting follow-up.
- **Bulk Unsubscriber:** Remove newsletter and marketing noise in batches.
- **Cold Email Blocker:** Filter low-value outreach before it steals attention.
- **Email Analytics:** See trends, senders, volume, response time, and cleanup opportunities.
- **Meeting Briefs:** Generate context before calls using email and calendar data.
- **Smart Filing:** Save attachments to Google Drive or OneDrive automatically.
- **Slack and Telegram:** Manage email workflows from the tools your team already uses.

## Self-Hosting

> **Prerequisites:** Docker and Node.js v24+

```bash
npx @inbox-zero/cli setup
npx @inbox-zero/cli start
```

Open http://localhost:3000.

## Local Development

> **Prerequisites:** Docker, Node.js v24+, and pnpm v10+

```bash
git clone <your-repo-url>
cd email_agent
docker compose -f docker-compose.dev.yml up -d
pnpm install
npm run setup
cd apps/web && pnpm prisma migrate dev && cd ../..
pnpm dev
```

Open http://localhost:3000.

After `pnpm install`, optional local provider emulators can be started with:

```bash
docker compose -f docker-compose.dev.yml --profile google-emulator up -d
docker compose -f docker-compose.dev.yml --profile microsoft-emulator up -d
```

Then set the matching provider variables in `apps/web/.env`.

## Built with

- Next.js
- Tailwind CSS
- shadcn/ui
- Prisma
- Upstash
- Turborepo

## Brand

Product name: **The Inbox Intern**

Powered by: **Devaicon**

Keep functional package names and CLI identifiers unchanged unless you are intentionally publishing renamed packages.