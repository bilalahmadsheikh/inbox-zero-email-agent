import type { Metadata } from "next";
import Link from "next/link";
import {
  LifeBuoy,
  Mail,
  MessageSquareText,
  Send,
  ShieldCheck,
} from "lucide-react";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Button } from "@/components/new-landing/common/Button";
import { Paragraph } from "@/components/new-landing/common/Typography";
import { SUPPORT_EMAIL, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Contact"),
  description:
    "Contact support, request documentation, or ask about a custom email workflow.",
  alternates: { canonical: "/contact" },
};

const contactOptions = [
  {
    title: "Product support",
    description:
      "Get help with accounts, billing, rules, drafts, or mailbox connections.",
    icon: LifeBuoy,
  },
  {
    title: "Documentation requests",
    description:
      "Ask for user-manual sections, onboarding guides, or team workflow docs.",
    icon: MessageSquareText,
  },
  {
    title: "Security and access",
    description:
      "Send questions about permissions, OAuth setup, SSO, or deployment policy.",
    icon: ShieldCheck,
  },
];

export default function ContactPage() {
  const subject = encodeURIComponent("Zynbox support request");
  const body = encodeURIComponent(
    "Hi,\n\nI need help with:\n\nWorkspace/domain:\n\nWhat I expected:\n\nWhat happened:\n\nThanks!",
  );
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

  return (
    <BasicLayout>
      <section className="py-14 text-center md:py-20">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[var(--landing-border)] bg-[var(--landing-surface)] text-[var(--landing-accent)] shadow-[var(--landing-shadow-soft)]">
          <Mail className="size-7" aria-hidden="true" />
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl font-title text-4xl leading-tight text-[var(--landing-text)] md:text-6xl">
          Contact us
        </h1>
        <Paragraph size="lg" className="mx-auto mt-5 max-w-2xl">
          Tell us what you are trying to set up, what is blocking you, or which
          documentation you want added to the public manual.
        </Paragraph>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="xl">
            <Link href={mailto}>
              <Send className="size-4" aria-hidden="true" />
              <span className="relative z-10">Email support</span>
            </Link>
          </Button>
          <Button asChild size="xl" variant="secondary-two">
            <Link href="/docs">View docs</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 pb-12 md:grid-cols-3">
        {contactOptions.map((option) => (
          <article
            key={option.title}
            className="rounded-[28px] border border-[var(--landing-border)] bg-[var(--landing-surface)] p-6 shadow-[var(--landing-shadow-soft)]"
          >
            <option.icon
              className="size-6 text-[var(--landing-accent)]"
              aria-hidden="true"
            />
            <h2 className="mt-5 font-title text-xl text-[var(--landing-text)]">
              {option.title}
            </h2>
            <Paragraph className="mt-2">{option.description}</Paragraph>
          </article>
        ))}
      </section>

      <section
        className="mb-16 rounded-[32px] border border-[var(--landing-border)] bg-[var(--landing-surface)] p-8 shadow-[var(--landing-shadow)] md:p-10"
        id="status"
      >
        <h2 className="font-title text-3xl text-[var(--landing-text)]">
          Helpful details to include
        </h2>
        <div className="mt-6 grid gap-4 text-left md:grid-cols-2">
          {[
            "Your email provider",
            "The page or workflow",
            "Screenshots or exact error text",
            "Whether this is hosted or self-managed",
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-[var(--landing-border-soft)] bg-[var(--landing-surface-hover)] px-4 py-3 text-sm font-medium text-[var(--landing-text)]"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </BasicLayout>
  );
}
