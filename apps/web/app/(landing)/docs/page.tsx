import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  Bot,
  CalendarDays,
  KeyRound,
  MailCheck,
  MessageSquare,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Button } from "@/components/new-landing/common/Button";
import {
  Paragraph,
  SectionHeading,
  Subheading,
} from "@/components/new-landing/common/Typography";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Documentation"),
  description: `User manual and setup documentation for ${BRAND_NAME}.`,
  alternates: { canonical: "/docs" },
};

const manuals = [
  {
    title: "Getting started",
    description:
      "Connect Gmail or Outlook, complete onboarding, and choose the workflows you want automated first.",
    icon: Sparkles,
    href: "#getting-started",
  },
  {
    title: "AI assistant",
    description:
      "Use chat, automation rules, drafting, labels, and clean-up actions without leaving your inbox workflow.",
    icon: Bot,
    href: "#assistant",
  },
  {
    title: "Bulk cleanup",
    description:
      "Unsubscribe, archive, and tame newsletter backlogs with guided review and reversible decisions.",
    icon: MailCheck,
    href: "#cleanup",
  },
  {
    title: "Calendar and briefs",
    description:
      "Connect calendars, create booking links, and receive AI meeting briefings before important calls.",
    icon: CalendarDays,
    href: "#calendar",
  },
  {
    title: "Messaging apps",
    description:
      "Connect Slack, Telegram, or Teams so the assistant can send updates and answer questions where you work.",
    icon: MessageSquare,
    href: "#messaging",
  },
  {
    title: "API and webhooks",
    description:
      "Create API keys, call automation endpoints, and configure webhooks for custom workflows.",
    icon: KeyRound,
    href: "#api",
  },
];

const guides = [
  [
    "Connect your mailbox",
    "Use Google or Microsoft OAuth from the login flow, then approve every requested permission so rules, drafts, labels, and analytics can work.",
  ],
  [
    "Configure your assistant",
    "Open the Assistant page, add rules in plain language, test them on recent emails, then enable automation once the results look right.",
  ],
  [
    "Clean subscriptions",
    "Use Bulk Unsubscribe to review frequent senders, unsubscribe where possible, and archive old issues in batches.",
  ],
  [
    "Set up docs for your team",
    "Point teammates to this page for the product manual, then use Contact if you need a custom internal workflow documented.",
  ],
];

export default function DocsPage() {
  return (
    <BasicLayout>
      <section className="py-14 text-center md:py-20">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-surface)] text-[var(--landing-accent)] shadow-[var(--landing-shadow-soft)]">
          <BookOpen className="size-7" aria-hidden="true" />
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl font-title text-4xl leading-tight text-[var(--landing-text)] md:text-6xl">
          {BRAND_NAME} user manual
        </h1>
        <Paragraph size="lg" className="mx-auto mt-5 max-w-2xl">
          Public documentation for setup, everyday workflows, integrations, and
          troubleshooting. This page is hosted inside the Vercel website so the
          Documentation button always lands here.
        </Paragraph>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="xl">
            <Link href="/login">
              <span className="relative z-10">Open dashboard</span>
            </Link>
          </Button>
          <Button asChild size="xl" variant="secondary-two">
            <Link href="/contact">Contact support</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 py-8 md:grid-cols-2 lg:grid-cols-3">
        {manuals.map((item) => (
          <Link
            key={item.title}
            id={item.href.slice(1)}
            href={item.href}
            className="rounded-[28px] border border-[var(--landing-border)] bg-[var(--landing-surface)] p-6 text-left shadow-[var(--landing-shadow-soft)] transition hover:-translate-y-0.5 hover:bg-[var(--landing-surface-hover)]"
          >
            <item.icon
              className="size-6 text-[var(--landing-accent)]"
              aria-hidden="true"
            />
            <h2 className="mt-5 font-title text-xl text-[var(--landing-text)]">
              {item.title}
            </h2>
            <Paragraph className="mt-2">{item.description}</Paragraph>
          </Link>
        ))}
      </section>

      <section className="py-12" id="core-workflows">
        <SectionHeading>Core workflows</SectionHeading>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {guides.map(([title, description]) => (
            <article
              key={title}
              className="rounded-[28px] border border-[var(--landing-border)] bg-[var(--landing-surface)] p-6 shadow-[var(--landing-shadow-soft)]"
            >
              <Subheading className="text-2xl">{title}</Subheading>
              <Paragraph className="mt-3">{description}</Paragraph>
            </article>
          ))}
        </div>
      </section>

      <section
        className="my-10 rounded-[32px] border border-[var(--landing-border)] bg-[var(--landing-surface)] p-8 shadow-[var(--landing-shadow)] md:p-10"
        id="security"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3 text-[var(--landing-accent)]">
              <ShieldCheck className="size-6" aria-hidden="true" />
              <span className="text-sm font-semibold uppercase tracking-[0.18em]">
                Security and setup
              </span>
            </div>
            <h2 className="mt-4 font-title text-3xl text-[var(--landing-text)]">
              Need deployment or policy docs?
            </h2>
            <Paragraph className="mt-3 max-w-2xl">
              The hosted manual covers user workflows. For custom deployment,
              compliance, or internal runbooks, send us the use case and we can
              extend this page with your required sections.
            </Paragraph>
          </div>
          <Button asChild variant="secondary-two" size="lg">
            <Link href="/contact">
              <Settings2 className="size-4" aria-hidden="true" />
              Request docs
            </Link>
          </Button>
        </div>
      </section>
    </BasicLayout>
  );
}
