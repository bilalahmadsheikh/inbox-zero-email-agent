import type { Metadata } from "next";
import { Hero, HeroContent } from "@/app/(landing)/home/Hero";
import { Awards } from "@/components/new-landing/sections/Awards";
import { EverythingElseSection } from "@/components/new-landing/sections/EverythingElseSection";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";
import { BulkUnsubscribe } from "@/components/new-landing/sections/BulkUnsubscribe";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { PreWrittenDrafts } from "@/components/new-landing/sections/PreWrittenDrafts";
import { ManageFromAnywhere } from "@/components/new-landing/sections/ManageFromAnywhere";
import { AutoFileAttachments } from "@/components/new-landing/sections/AutoFileAttachments";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { BRAND_NAME } from "@/utils/branding";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function NewLanding() {
  return (
    <BasicLayout>
      <Hero
        title={
          <span className="inline-flex flex-col items-center gap-2">
            <span className="bg-[image:var(--landing-hero-gradient)] bg-clip-text font-sans font-bold text-transparent">
              Zynbox
            </span>
            <span className="font-geist text-xs font-semibold text-[var(--landing-muted)] md:text-sm">
              by Devaicon
            </span>
          </span>
        }
        subtitle={`${BRAND_NAME} organizes your inbox and calendar, drafts replies in your voice, and helps you reach inbox zero fast. Never miss an important email again.`}
      >
        <HeroContent />
      </Hero>
      <OrganizedInbox
        title={
          <>
            Automatically organized.
            <br />
            Never miss an important email again.
          </>
        }
        subtitle="Drowning in emails? Don't waste energy trying to prioritize your emails. Our AI assistant will label everything automatically."
      />
      <PreWrittenDrafts
        title="Pre-written drafts waiting in your inbox"
        subtitle="When you check your inbox, every email needing a response will have a pre-drafted reply in your tone, ready for you to send."
      />
      <ManageFromAnywhere />
      <StartedInMinutes
        title="Get started in minutes"
        subtitle="One-click setup. Start organizing and drafting replies in minutes."
      />
      <BulkUnsubscribe />
      <AutoFileAttachments />
      <EverythingElseSection />
      <Awards />
      <FinalCTA />
      <FAQs />
    </BasicLayout>
  );
}
