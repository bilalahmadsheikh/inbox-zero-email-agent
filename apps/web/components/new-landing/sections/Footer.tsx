import Link from "next/link";
import { env } from "@/env";
import { Logo } from "@/components/new-landing/common/Logo";
import { cn } from "@/utils";
import { FooterLineLogo } from "@/components/new-landing/FooterLineLogo";
import { Paragraph } from "@/components/new-landing/common/Typography";
import { UnicornScene } from "@/components/new-landing/UnicornScene";
import {
  footerNavigation,
  SelfHostedFooterLinks,
} from "@/app/(landing)/home/Footer";
import { BRAND_LOGO_URL } from "@/utils/branding";

interface FooterProps {
  className: string;
  variant?: "default" | "simple";
}

export function Footer({ className, variant = "default" }: FooterProps) {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    return (
      <footer className="border-t border-[var(--landing-border)] bg-[var(--landing-bg-soft)] bg-cover bg-center bg-no-repeat overflow-hidden transition-colors">
        <div className={cn("overflow-hidden px-6 py-12 lg:px-8", className)}>
          <SelfHostedFooterLinks />
        </div>
      </footer>
    );
  }

  return (
    <footer
      className={cn(
        "border-t border-[var(--landing-border)] bg-[var(--landing-bg-soft)] bg-cover bg-center bg-no-repeat overflow-hidden transition-colors",
        variant === "default" && "relative z-50",
      )}
    >
      {variant === "default" ? <UnicornScene className="opacity-15" /> : null}
      <div
        className={cn("overflow-hidden px-6 py-20 sm:py-24 lg:px-8", className)}
      >
        <div className="mb-14 flex justify-center sm:justify-start">
          <Logo className="h-20 w-auto max-w-[260px] sm:h-24 sm:max-w-[320px]" />
        </div>
        <nav aria-label="Footer">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-5 xl:col-span-2">
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
              <div className="mt-6">
                <FooterList title="Compare" items={footerNavigation.compare} />
              </div>
            </div>
          </div>
        </nav>
      </div>
      {variant === "default" && !BRAND_LOGO_URL ? (
        <FooterLineLogo className="hidden xl:block absolute bottom-0 left-1/2 -translate-x-1/2 mx-auto px-6 lg:px-8 -z-10" />
      ) : null}
    </footer>
  );
}

function FooterList(props: {
  title: string;
  items: { name: string; href?: string; target?: string }[];
}) {
  return (
    <>
      <Paragraph
        color="gray-900"
        size="sm"
        className="font-semibold leading-6"
        as="h3"
      >
        {props.title}
      </Paragraph>
      <ul className="mt-6 space-y-3">
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
