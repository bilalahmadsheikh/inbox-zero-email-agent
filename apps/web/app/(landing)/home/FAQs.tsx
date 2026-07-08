import { Card, CardContent } from "@/components/new-landing/common/Card";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  Paragraph,
  SectionHeading,
} from "@/components/new-landing/common/Typography";
import { BRAND_NAME } from "@/utils/branding";

const faqs: {
  question: string;
  answer: React.ReactNode;
  answerText?: string;
}[] = [
  {
    question: `Which email providers does ${BRAND_NAME} support?`,
    answer:
      "We support Gmail, Google Workspace, and Microsoft Outlook email accounts.",
  },
  {
    question: "How can I request a feature?",
    answer:
      "Send us a note through support with the workflow you want improved. We review product requests regularly.",
  },
  {
    question: `Will ${BRAND_NAME} replace my current email client?`,
    answer: `No. ${BRAND_NAME} works alongside Gmail and Outlook so your current inbox stays familiar while automation handles the repetitive work.`,
  },
  {
    question: "Is self-hosting available?",
    answer:
      "Yes. Teams can self-host when they need infrastructure-level control and custom deployment policies.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "Yes. If the product is not a fit, contact support within 14 days of upgrading and we will refund you.",
  },
  {
    question: `Can I try ${BRAND_NAME} for free?`,
    answer:
      "Absolutely. Plans include a 7 day free trial so you can try the workflow without a credit card.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs
    .map((faq) => {
      const text = typeof faq.answer === "string" ? faq.answer : faq.answerText;
      if (!text) return null;
      return {
        "@type": "Question" as const,
        name: faq.question,
        acceptedAnswer: { "@type": "Answer" as const, text },
      };
    })
    .filter(Boolean),
};

export function FAQs() {
  return (
    <Section>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify on controlled object is safe
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <SectionHeading>Frequently asked questions</SectionHeading>
      <SectionContent>
        <CardWrapper>
          <dl className="grid md:grid-cols-2 gap-6">
            {faqs.map((faq) => (
              <Card
                variant="extra-rounding"
                className="gap-4"
                key={faq.question}
              >
                <CardContent>
                  <Paragraph
                    as="dt"
                    color="gray-900"
                    className="font-semibold tracking-tight mb-4"
                  >
                    {faq.question}
                  </Paragraph>
                  <dd>
                    <Paragraph>{faq.answer}</Paragraph>
                  </dd>
                </CardContent>
              </Card>
            ))}
          </dl>
        </CardWrapper>
      </SectionContent>
    </Section>
  );
}
