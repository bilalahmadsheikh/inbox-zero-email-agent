import Link from "next/link";
import { Logo } from "@/components/new-landing/common/Logo";
import { EXTENSION_URL } from "@/utils/config";
import { BRAND_NAME } from "@/utils/branding";

type FooterNavigationItem = {
  name: string;
  href?: string;
  target?: string;
};

export const footerNavigation: Record<string, FooterNavigationItem[]> = {
  main: [
    {
      name: `${BRAND_NAME} Tabs (Chrome Extension)`,
      href: EXTENSION_URL,
      target: "_blank",
    },
    { name: "AI Email Assistant", href: "/ai-automation" },
    { name: "Mobile App", href: "/mobile-app" },
    { name: "AI Chat for Slack & Telegram", href: "/ai-assistant-chat" },
    { name: "Slack AI Assistant", href: "/slack-integration" },
    { name: "Telegram AI Assistant", href: "/telegram-integration" },
    { name: "Teams AI Assistant", href: "/teams-integration" },
    { name: "Brief My Meeting", href: "/brief-my-meeting" },
    { name: "Reply Zero", href: "/reply-zero-ai" },
    { name: "Bulk Email Unsubscriber", href: "/bulk-email-unsubscriber" },
    { name: "Clean your inbox", href: "/clean-inbox" },
    { name: "Cold Email Blocker", href: "/block-cold-emails" },
    { name: "Email Analytics", href: "/email-analytics" },
    { name: "Auto Forward Emails", href: "/auto-forward-emails" },
    { name: "Auto-File Attachments", href: "/auto-file-email-attachments" },
  ],
  useCases: [
    { name: "Founder", href: "/founders" },
    { name: "Small Business", href: "/small-business" },
    { name: "Content Creator", href: "/creator" },
    { name: "Realtor", href: "/real-estate" },
    { name: "Customer Support", href: "/customer-support" },
    { name: "E-commerce", href: "/ecommerce" },
  ],
  industries: [
    { name: "MSPs", href: "/msp" },
    { name: "Property Management", href: "/property-management" },
    { name: "Law Firms", href: "/law-firms" },
    { name: "Accounting Firms", href: "/accounting-firms" },
  ],
  compare: [
    {
      name: "Best AI Email Assistants",
      href: "/blog/post/best-ai-email-assistants",
    },
    { name: "vs Fyxer.ai", href: "/best-fyxer-alternative" },
    { name: "vs Superhuman", href: "/best-superhuman-alternative" },
    { name: "vs Shortwave", href: "/best-shortwave-alternative" },
    {
      name: "vs Perplexity Email Assistant",
      href: "/best-perplexity-email-assistant-alternative",
    },
  ],
  tools: [
    {
      name: "Email Deliverability Checker",
      href: "/tools/email-deliverability-checker",
    },
    { name: "Gmail Personality Quiz", href: "/tools/gmail-quiz" },
    { name: "Subject Line Analyzer", href: "/tools/subject-line-analyzer" },
    {
      name: "Email Signature Generator",
      href: "/tools/email-signature-generator",
    },
    { name: "Meeting Cost Calculator", href: "/tools/meeting-cost-calculator" },
  ],
  support: [
    { name: "Support", href: "/contact" },
    { name: "Contact us", href: "/contact" },
    { name: "Documentation", href: "/docs" },
    { name: "Changelog", href: "/docs" },
    { name: "Status", href: "/contact#status" },
    { name: "CLI", href: "/cli" },
    { name: "OpenClaw Skill", href: "/openclaw" },
  ],
  company: [
    { name: "Affiliates", href: "/contact" },
    { name: "Blog", href: "/blog" },
    { name: "Case Studies", href: "/case-studies" },
    { name: "OSS Friends", href: "/oss-friends" },
    { name: "Email Blaster", href: "/game" },
  ],
  legal: [
    { name: "Terms", href: "/terms" },
    { name: "Privacy", href: "/privacy" },
    { name: "Security", href: "/docs#security" },
  ],
  social: [],
};

const selfHostedFooter = {
  resources: [
    { name: "Documentation", href: "/docs" },
    { name: "Contact us", href: "/contact" },
  ],
  legal: [
    { name: "Terms", href: "/terms" },
    { name: "Privacy", href: "/privacy" },
  ],
};

export function Footer() {
  return (
    <footer className="relative">
      <div className="mx-auto max-w-7xl overflow-hidden px-6 py-20 sm:py-24 lg:px-8">
        <nav aria-label="Footer">
          <div className="mt-16 grid grid-cols-2 gap-8 lg:grid-cols-5 xl:col-span-2 xl:mt-0">
            <div>
              <FooterList title="Product" items={footerNavigation.main} />
            </div>
            <div>
              <FooterList title="Use Cases" items={footerNavigation.useCases} />
              <div className="mt-6">
                <FooterList
                  title="Industries"
                  items={footerNavigation.industries}
                />
              </div>
              <div className="mt-6">
                <FooterList title="Compare" items={footerNavigation.compare} />
              </div>
            </div>
            <div>
              <FooterList title="Support" items={footerNavigation.support} />
              <div className="mt-6">
                <FooterList title="Free Tools" items={footerNavigation.tools} />
              </div>
            </div>
            <div>
              <FooterList title="Company" items={footerNavigation.company} />
            </div>
            <div>
              <FooterList title="Legal" items={footerNavigation.legal} />
            </div>
          </div>
        </nav>

        <p className="mt-10 text-center text-xs leading-5 text-[var(--landing-muted)]">
          &copy; {new Date().getFullYear()} Devaicon. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export function SelfHostedFooterLinks() {
  return (
    <>
      <div className="mb-8 flex justify-center">
        <Logo className="h-20 w-auto max-w-[260px] sm:h-24 sm:max-w-[320px]" />
      </div>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {selfHostedFooter.resources.map((item) => (
          <Link
            key={item.name}
            href={item.href || "#"}
            className="text-sm leading-6 text-[var(--landing-muted)] hover:text-[var(--landing-text)]"
          >
            {item.name}
          </Link>
        ))}
        <span className="text-[var(--landing-border)]">|</span>
        {selfHostedFooter.legal.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="text-sm leading-6 text-[var(--landing-muted)] hover:text-[var(--landing-text)]"
          >
            {item.name}
          </Link>
        ))}
      </div>
      <p className="mt-6 text-center text-xs leading-5 text-gray-500">
        Powered by Devaicon
      </p>
    </>
  );
}

function FooterList(props: { title: string; items: FooterNavigationItem[] }) {
  return (
    <>
      <h3 className="text-sm font-semibold leading-6 text-[var(--landing-text)]">
        {props.title}
      </h3>
      <ul className="mt-6 space-y-4">
        {props.items.map((item) => (
          <li key={item.name}>
            {item.href ? (
              <Link
                href={item.href}
                target={item.target}
                prefetch={item.target !== "_blank"}
                className="text-sm leading-6 text-[var(--landing-muted)] hover:text-[var(--landing-text)]"
              >
                {item.name}
              </Link>
            ) : (
              <span className="text-sm leading-6 text-[var(--landing-muted)]">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
