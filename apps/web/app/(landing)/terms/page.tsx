import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import {
  PageHeading,
  Paragraph,
} from "@/components/new-landing/common/Typography";
import { BRAND_NAME, SUPPORT_EMAIL, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Terms of Service"),
  description: `The terms and conditions for using ${BRAND_NAME}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <BasicLayout>
      <section className="mx-auto max-w-3xl py-14 md:py-20">
        <PageHeading>Terms of Service</PageHeading>
        <Paragraph size="lg" className="mt-5">
          Subject to these Terms of Service (this &ldquo;Agreement&rdquo;),{" "}
          {BRAND_NAME} (&ldquo;{BRAND_NAME}&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo; and/or &ldquo;our&rdquo;) provides access to{" "}
          {BRAND_NAME}&rsquo;s cloud platform as a service (collectively, the
          &ldquo;Services&rdquo;). By using or accessing the Services, you
          acknowledge that you have read, understand, and agree to be bound by
          this Agreement.
        </Paragraph>
        <Paragraph className="mt-4">
          If you are entering into this Agreement on behalf of a company,
          business or other legal entity, you represent that you have the
          authority to bind such entity to this Agreement, in which case the
          term &ldquo;you&rdquo; shall refer to such entity. If you do not have
          such authority, or if you do not agree with this Agreement, you must
          not accept this Agreement and may not use the Services.
        </Paragraph>

        <TermsSection title="1. Acceptance of Terms">
          By signing up and using the services provided by {BRAND_NAME}{" "}
          (referred to as the &ldquo;Service&rdquo;), you are agreeing to be
          bound by the following terms and conditions (&ldquo;Terms of
          Service&rdquo;). The Service is owned and operated by {BRAND_NAME}{" "}
          (&ldquo;Us&rdquo;, &ldquo;We&rdquo;, or &ldquo;Our&rdquo;).
        </TermsSection>

        <TermsSection title="2. Description of Service">
          {BRAND_NAME} provides an email management tool (&ldquo;the
          Product&rdquo;). The Product is accessible through domains and
          subdomains controlled by Us (collectively, &ldquo;the Website&rdquo;).
        </TermsSection>

        <TermsSection title="3. Fair Use">
          You are responsible for your use of the Service and for any content
          that you post or transmit through the Service. You may not use the
          Service for any purpose that is illegal or infringes upon the rights
          of others.
          <br />
          <br />
          We reserve the right to suspend or terminate your access to the
          Service if we determine, in our sole discretion, that you have
          violated these Terms of Service.
        </TermsSection>

        <TermsSection title="4. Intellectual Property Rights">
          You acknowledge and agree that the Service and its entire contents,
          features, and functionality, including but not limited to all
          information, software, code, text, displays, graphics, photographs,
          video, audio, design, presentation, selection, and arrangement, are
          owned by Us, our licensors, or other providers of such material and
          are protected by international copyright, trademark, patent, trade
          secret, and other intellectual property or proprietary rights laws.
        </TermsSection>

        <TermsSection title="5. Changes to these Terms">
          We reserve the right to revise and update these Terms of Service from
          time to time in our sole discretion. All changes are effective
          immediately when we post them, and apply to all access to and use of
          the Website thereafter. Your continued use of the Website following
          the posting of revised Terms of Service means that you accept and
          agree to the changes.
        </TermsSection>

        <TermsSection title="6. Contact Information">
          Questions or comments about the Website or these Terms of Service may
          be directed to our support team at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-[var(--landing-accent)] underline"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </TermsSection>

        <TermsSection title="7. Disclaimer of Warranties">
          THE SERVICE AND ITS CONTENT ARE PROVIDED ON AN &ldquo;AS IS&rdquo; AND
          &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT ANY WARRANTIES OF ANY KIND.
          WE DISCLAIM ALL WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
          WARRANTY OF TITLE, MERCHANTABILITY, NON-INFRINGEMENT OF THIRD
          PARTIES&rsquo; RIGHTS, AND FITNESS FOR PARTICULAR PURPOSE.
        </TermsSection>

        <TermsSection title="8. Limitation of Liability">
          IN NO EVENT WILL WE, OUR AFFILIATES OR THEIR LICENSORS, SERVICE
          PROVIDERS, EMPLOYEES, AGENTS, OFFICERS OR DIRECTORS BE LIABLE FOR
          DAMAGES OF ANY KIND, UNDER ANY LEGAL THEORY, ARISING OUT OF OR IN
          CONNECTION WITH YOUR USE, OR INABILITY TO USE, THE WEBSITE, THE
          SERVICE, ANY WEBSITES LINKED TO IT, ANY CONTENT ON THE WEBSITE OR SUCH
          OTHER WEBSITES, INCLUDING ANY DIRECT, INDIRECT, SPECIAL, INCIDENTAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES.
        </TermsSection>

        <TermsSection title="9. Governing Law and Jurisdiction">
          These Terms of Service and any dispute or claim arising out of or
          related to them, their subject matter or their formation (in each
          case, including non-contractual disputes or claims) shall be governed
          by and construed in accordance with the internal laws of the State of
          New York without giving effect to any choice or conflict of law
          provision or rule. Any legal suit, action, or proceeding arising out
          of, or related to, these Terms of Service or the Website shall be
          instituted exclusively in the federal courts of the United States or
          the courts of the State of New York.
        </TermsSection>

        <Paragraph className="mt-10">
          By using {BRAND_NAME}, you acknowledge that you have read these Terms
          of Service, understood them, and agree to be bound by them. If you do
          not agree to these Terms of Service, you are not authorized to use the
          Service. We reserve the right to change these Terms of Service at any
          time, so please review them frequently.
        </Paragraph>
        <Paragraph className="mt-4">
          Thank you for using {BRAND_NAME}!
        </Paragraph>
      </section>
    </BasicLayout>
  );
}

function TermsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-10">
      <h2 className="font-title text-2xl text-[var(--landing-text)]">
        {title}
      </h2>
      <Paragraph className="mt-3">{children}</Paragraph>
    </div>
  );
}
