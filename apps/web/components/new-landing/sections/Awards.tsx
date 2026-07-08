import { Section } from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";

export function Awards() {
  return (
    <Section>
      <SectionHeading>Privacy first, built for serious teams</SectionHeading>
      <SectionSubtitle>
        Your data stays private — no AI training, no funny business. We’re fully
        certified for top-tier security, and you can even self-host The Inbox
        Intern if you want total control.
      </SectionSubtitle>
    </Section>
  );
}
