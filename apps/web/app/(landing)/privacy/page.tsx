import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import {
  PageHeading,
  Paragraph,
} from "@/components/new-landing/common/Typography";
import { BRAND_NAME, SUPPORT_EMAIL, getBrandTitle } from "@/utils/branding";

// TODO: Update these with the operating entity's real legal name and
// registered address before relying on this policy in production.
const COMPANY_NAME = "Devaicon";
const COMPANY_ADDRESS = "[Registered company address]";
const LAST_UPDATED = "May 4, 2026";

export const metadata: Metadata = {
  title: getBrandTitle("Privacy Policy"),
  description: `How ${BRAND_NAME} collects, uses, and protects your personal data.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <BasicLayout>
      <section className="mx-auto max-w-3xl py-14 md:py-20">
        <PageHeading>Privacy Policy</PageHeading>
        <Paragraph className="mt-4 text-[var(--landing-muted-soft)]">
          Last Updated: {LAST_UPDATED}
        </Paragraph>

        <PolicySection title="1. Important Information and Who We Are">
          <SubHeading>1.1 Purpose of This Privacy Policy</SubHeading>
          <Paragraph className="mt-2">
            {`This privacy policy aims to give you information on how ${BRAND_NAME} collects and processes your personal data through your use of our website, our email automation services, or otherwise when you communicate or interact with us in the course of business. This policy applies whether you connect a Google email account (Gmail or Google Workspace) or Microsoft email account (Microsoft 365, Outlook.com, or Exchange).`}
          </Paragraph>

          <SubHeading className="mt-6">
            1.2 Data Controller and Data Processor
          </SubHeading>
          <Paragraph className="mt-2">
            {`When we act as Data Controller: For personal data about you as a registered user (your account information, authentication data, usage patterns), ${BRAND_NAME} acts as the 'data controller' under GDPR and similar data protection laws.`}
          </Paragraph>
          <Paragraph className="mt-2">
            {`When we act as Data Processor: For personal data contained in your emails and email account information that you submit to ${BRAND_NAME} to use our services (such as email content, sender/recipient information, calendar data), we act as the 'data processor' on your behalf. If we are the data processor of your personal data, you (or your organization) are the data controller, and you should contact the controller party in the first instance to address rights with respect to such data.`}
          </Paragraph>

          <SubHeading className="mt-6">1.3 Contact Details</SubHeading>
          <Paragraph className="mt-2">
            Company: {COMPANY_NAME}
            <br />
            Address: {COMPANY_ADDRESS}
            <br />
            Email:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-[var(--landing-accent)] underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </Paragraph>
          <Paragraph className="mt-2">
            Data Protection Inquiries: For data protection inquiries, contact us
            at the email above.
          </Paragraph>
          <Paragraph className="mt-2">
            You have the right to make a complaint at any time to your local
            data protection authority. In the EU, this is your national
            supervisory authority. In the UK, this is the Information
            Commissioner&rsquo;s Office (ICO) at www.ico.org.uk. We would,
            however, appreciate the chance to deal with your concerns before you
            approach a supervisory authority, so please contact us in the first
            instance.
          </Paragraph>

          <SubHeading className="mt-6">
            1.4 Changes to the Privacy Policy
          </SubHeading>
          <Paragraph className="mt-2">
            If you use our website or services after any changes to this privacy
            policy have been posted, that means you agree to all of the changes.
          </Paragraph>
          <Paragraph className="mt-2">
            It is important that the personal data we hold about you is accurate
            and current. Please keep us informed if your personal data changes
            during your relationship with us.
          </Paragraph>
        </PolicySection>

        <PolicySection title="2. The Data We Collect About You">
          <Paragraph className="mt-2">
            We may create aggregated, de-identified, or anonymized data from the
            personal data we collect, including by removing information that
            makes the data personally identifiable to a particular user. We may
            use such aggregated, de-identified, or anonymized data and share it
            with third parties for our lawful business purposes, including to
            analyze, build, and improve our services and promote our business,
            provided that we will not disclose such data in a manner that could
            identify you.
          </Paragraph>
          <Paragraph className="mt-2">
            We may collect, use, store, and transfer different kinds of personal
            data about you, which we have grouped together as follows:
          </Paragraph>
          <List
            items={[
              "Identity Data: includes name, username, or similar identifier.",
              "Contact Data: includes your email address from your connected Google or Microsoft email account.",
              "Authentication Data: includes login credentials, OAuth tokens, and API access tokens for your connected email accounts.",
              "Email Account Data: As a data processor, we process email content, metadata (sender, recipient, subject lines, timestamps, folders/labels), and email account settings on your behalf to provide our services.",
              "Financial Data: includes payment method details and billing information.",
              "Technical Data: includes internet protocol (IP) address, browser type and version, time zone setting and location, browser plug-in types and versions, operating system and platform, and other technology on the devices you use to access our website or services.",
              "Usage Data: includes information about how you use our website and services.",
              "Communication Data: includes your communications with us (support requests, feedback).",
            ]}
          />

          <SubHeading className="mt-6">
            What We Store and What We Don&rsquo;t
          </SubHeading>
          <Paragraph className="mt-2">We do NOT permanently store:</Paragraph>
          <List
            items={[
              "Full email content (body text)",
              "Email subject lines (except as needed for active features)",
            ]}
          />
          <Paragraph className="mt-4">We DO store:</Paragraph>
          <List
            items={[
              "Sender information (email addresses of people who email you) for analytics and features like bulk unsubscribe",
              "Summaries and analysis of your email history to provide personalized features and insights",
              "Email metadata needed for automation rules and account insights",
              "Temporary email summaries for active features (e.g., digest emails), which are deleted after the feature completes",
            ]}
          />
          <Paragraph className="mt-4">
            Email content is analyzed to provide our services but is not
            retained in our systems beyond what is necessary to deliver the
            requested features.
          </Paragraph>
        </PolicySection>

        <PolicySection title="3. How Is Your Personal Data Collected?">
          <Paragraph className="mt-2">
            We use different methods to collect data from and about you
            including through:
          </Paragraph>
          <List
            items={[
              "Direct interactions: We collect the majority of your data through our products and services on our website, by email, or otherwise when you create an account and connect your email accounts.",
              "Automated technologies or interactions: As you interact with our website and services, we may automatically collect Technical Data about your browsing actions and patterns. We collect this personal data by using cookies and other similar technologies.",
              "Third-party or publicly available sources: We may receive Technical Data from analytics providers such as PostHog. We receive email and calendar data from Google services or Microsoft services when you authorize us to access your account.",
            ]}
          />
        </PolicySection>

        <PolicySection title="4. Legal Basis for Processing Your Personal Data">
          <Paragraph className="mt-2">
            We will only use your personal data when the law allows us to. Most
            commonly, we will use your personal data in the following
            circumstances:
          </Paragraph>
          <List
            items={[
              "In accordance with the terms of use or service agreement that we have with you (Performance of Contract);",
              "Where it is necessary for our legitimate interests (or those of a third party) in the operation of our business and we have made an objective assessment that your interests and fundamental rights do not override those interests (for example to manage our relationship with you, improve our services, or respond to your inquiries); or",
              "Where we need to comply with a legal or regulatory obligation.",
            ]}
          />
          <Paragraph className="mt-4">
            Please contact us if you need details about the specific legal
            ground we are relying on to process your personal data.
          </Paragraph>
        </PolicySection>

        <PolicySection title="5. Data Shared with Third-Party AI Models">
          <SubHeading>5.1 Data Shared with AI Models</SubHeading>
          <Paragraph className="mt-2">
            In order to provide email categorization, response generation, and
            automation features, our service employs machine learning models
            using third-party AI services. We require our AI service providers
            to use your information only for the purpose of providing our
            services. We do not allow those providers to train their AI models
            using your data.
          </Paragraph>
          <Paragraph className="mt-2">
            The following data types may be shared with these AI models:
          </Paragraph>
          <List
            items={[
              "Email Content and Metadata: Email subject lines, email body text, sender and recipient information, timestamps, and folder/label information.",
            ]}
          />
          <Paragraph className="mt-4">
            This data is processed for the sole purpose of delivering the
            AI-powered features you have requested and is not used for any other
            functions within the AI models.
          </Paragraph>

          <SubHeading className="mt-6">5.2 Zero Data Retention</SubHeading>
          <Paragraph className="mt-2">
            Our AI service providers have policies that prohibit using customer
            data submitted via their APIs to train their models. AI providers
            process data only as necessary to deliver the requested service and
            do not store your data on their servers beyond what is required for
            abuse and misuse monitoring.
          </Paragraph>
        </PolicySection>

        <PolicySection title="6. Disclosures of Your Personal Data">
          <Paragraph className="mt-2">
            We may share your personal data with the parties set out below for
            the purposes set out in section 4 above:
          </Paragraph>
          <List
            items={[
              "Our service providers acting as processors who may be based in the US or elsewhere outside the EEA and who provide us with IT support, hosting, data storage, monitoring, analytics, email delivery, and AI language model services.",
              "Third parties to whom we may choose to sell, transfer, or merge parts of our business or our assets. Alternatively, we may seek to acquire other businesses or merge with them. If a change happens to our business, then the new owners may use your personal data in the same way as set out in this privacy policy.",
            ]}
          />
          <Paragraph className="mt-4">
            We require all third parties to respect the security of your
            personal data and to treat it in accordance with the law. We do not
            allow our third-party service providers to use your personal data
            for their own purposes and only permit them to process your personal
            data for specified purposes and in accordance with our instructions.
          </Paragraph>
          <Paragraph className="mt-2">
            {`A current list of subprocessors for the hosted ${BRAND_NAME} service is available on request by contacting us at the email above.`}
          </Paragraph>

          <SubHeading className="mt-6">
            Email Provider API Compliance
          </SubHeading>
          <Paragraph className="mt-3 font-semibold text-[var(--landing-text)]">
            Google API Services User Data Policy
          </Paragraph>
          <Paragraph className="mt-2">
            {`${BRAND_NAME}'s use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.`}
          </Paragraph>
          <Paragraph className="mt-2">
            We only use access to your Google email account (Gmail, Google
            Workspace, or other Google-hosted email) to:
          </Paragraph>
          <List
            items={[
              "Read emails for AI processing and automation",
              "Send emails on your behalf as directed",
              "Manage email labels, categories, and organization",
              "Access email metadata for automation rules",
            ]}
          />
          <Paragraph className="mt-4">We do not:</Paragraph>
          <List
            items={[
              "Use your Google email data for advertising purposes",
              "Share your Google email data with third parties except as described in this policy",
              "Store your email content on our servers",
            ]}
          />

          <Paragraph className="mt-6 font-semibold text-[var(--landing-text)]">
            Microsoft Graph API Services
          </Paragraph>
          <Paragraph className="mt-2">
            {`${BRAND_NAME}'s use of information received from Microsoft Graph API adheres to Microsoft's data handling requirements and the Microsoft API Terms of Use.`}
          </Paragraph>
          <Paragraph className="mt-2">
            We only use access to your Microsoft email account (Microsoft 365,
            Outlook.com, Exchange, or other Microsoft-hosted email) to:
          </Paragraph>
          <List
            items={[
              "Read emails for AI processing and automation",
              "Send emails on your behalf as directed",
              "Manage email folders, categories, and organization",
              "Access email metadata for automation rules",
            ]}
          />
          <Paragraph className="mt-4">We do not:</Paragraph>
          <List
            items={[
              "Use your Microsoft email data for advertising purposes",
              "Share your Microsoft email data with third parties except as described in this policy",
              "Store your email content on our servers",
            ]}
          />
        </PolicySection>

        <PolicySection title="7. International Transfers">
          <Paragraph className="mt-2">
            If you are located in the European Economic Area (EEA), UK, or other
            jurisdictions outside the United States, your personal data may be
            transferred to and processed in the United States or other countries
            where our service providers operate.
          </Paragraph>
          <Paragraph className="mt-2">
            Whenever we transfer your personal data out of the EEA, we ensure a
            similar degree of protection is afforded to it by ensuring that
            either:
          </Paragraph>
          <List
            items={[
              "We have a specific contract in a form approved by the European Commission (Standard Contractual Clauses) which ensures your personal data receives the same protection it has in Europe; or",
              "Our service providers are members of the EU-US Data Privacy Framework which requires them to provide similar protection to personal data shared between Europe and the US.",
            ]}
          />
          <Paragraph className="mt-4">
            Please contact us if you want further information on the specific
            mechanism used when transferring your personal data.
          </Paragraph>
        </PolicySection>

        <PolicySection title="8. Data Security">
          <Paragraph className="mt-2">
            We have implemented appropriate technical and organizational
            security measures to protect your personal data from unauthorized
            access, loss, alteration, or disclosure.
          </Paragraph>
          <Paragraph className="mt-2">
            We have procedures in place to detect, report, and respond to any
            suspected personal data breach and will notify you and any
            applicable regulator where we are legally required to do so.
          </Paragraph>
        </PolicySection>

        <PolicySection title="9. Data Retention">
          <Paragraph className="mt-2">
            We will only retain your personal data for as long as necessary to
            fulfill the purposes we collected it for, including for the purposes
            of satisfying any legal, accounting, or reporting requirements.
          </Paragraph>
          <Paragraph className="mt-2">
            To determine the appropriate retention period for personal data, we
            consider the amount, nature, and sensitivity of the personal data,
            the potential risk of harm from unauthorized use or disclosure of
            your personal data, the purposes for which we process your personal
            data and whether we can achieve those purposes through other means,
            and the applicable legal requirements.
          </Paragraph>
          <Paragraph className="mt-2">
            In some circumstances, you can ask us to delete your data (see below
            for further information).
          </Paragraph>
          <Paragraph className="mt-2">
            In some circumstances we may anonymize your personal data (so that
            it can no longer be associated with you) for research or statistical
            purposes, in which case we may use this information indefinitely
            without further notice to you.
          </Paragraph>
        </PolicySection>

        <PolicySection title="10. Your Legal Rights">
          <Paragraph className="mt-2">
            You have the right in certain circumstances to:
          </Paragraph>
          <List
            items={[
              'Request access to your personal data (a "data subject access request").',
              "Request correction of the personal data that we hold about you.",
              "Request erasure of your personal data.",
              "Object to processing of your personal data where we are relying on a legitimate interest (or those of a third party) and there is something about your particular situation which makes you want to object to processing on this ground as you feel it impacts on your fundamental rights and freedoms.",
              "Request restriction of processing of your personal data.",
              "Request the transfer of your personal data to you or to a third party.",
            ]}
          />
          <Paragraph className="mt-4">
            More information on these rights and when they apply is available
            here:{" "}
            <a
              href="https://ico.org.uk/for-organisations/guide-to-the-general-data-protection-regulation-gdpr/individual-rights/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--landing-accent)] underline"
            >
              ICO individual rights guide
            </a>
          </Paragraph>
          <Paragraph className="mt-2">
            You will not have to pay a fee to access your personal data (or to
            exercise any of the other rights). We may need to request specific
            information from you to help us confirm your identity and ensure
            your right to access your personal data (or to exercise any of your
            other rights). This is a security measure to ensure that personal
            data is not disclosed to any person who has no right to receive it.
            We may also contact you to ask you for further information in
            relation to your request to speed up our response.
          </Paragraph>
          <Paragraph className="mt-2">
            We try to respond to all legitimate requests within one month.
            Occasionally it may take us longer than a month if your request is
            particularly complex or you have made a number of requests. In this
            case, we will notify you and keep you updated.
          </Paragraph>
          <Paragraph className="mt-2">
            All the above categories exclude text messaging originator opt-in
            data and consent; this information will not be shared with any third
            parties.
          </Paragraph>
        </PolicySection>
      </section>
    </BasicLayout>
  );
}

function PolicySection({
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
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SubHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`font-semibold text-[var(--landing-text)] ${className ?? ""}`}
    >
      {children}
    </h3>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-2 pl-6">
      {items.map((item) => (
        <li key={item} className="text-[var(--landing-muted)]">
          {item}
        </li>
      ))}
    </ul>
  );
}
