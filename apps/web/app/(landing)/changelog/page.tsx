import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import {
  PageHeading,
  Paragraph,
} from "@/components/new-landing/common/Typography";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";
import { changelog } from "@/utils/changelog";

export const metadata: Metadata = {
  title: getBrandTitle("Changelog"),
  description: `What's new in ${BRAND_NAME}: every version and what changed.`,
  alternates: { canonical: "/changelog" },
};

export default function ChangelogPage() {
  return (
    <BasicLayout>
      <section className="mx-auto max-w-3xl py-14 md:py-20">
        <PageHeading>Changelog</PageHeading>
        <Paragraph className="mt-4 text-[var(--landing-muted-soft)]">
          Every {BRAND_NAME} release and what changed in it.
        </Paragraph>

        <div className="mt-10 space-y-12">
          {changelog.map((entry) => (
            <article key={entry.version}>
              <div className="flex items-baseline gap-3">
                <h2 className="text-2xl font-semibold">
                  Version {entry.version}
                </h2>
                <span className="text-sm text-[var(--landing-muted-soft)]">
                  {entry.date}
                </span>
              </div>
              <ul className="mt-4 list-disc space-y-2 pl-5">
                {entry.notes.map((note) => (
                  <li key={note} className="leading-relaxed">
                    {note}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </BasicLayout>
  );
}
