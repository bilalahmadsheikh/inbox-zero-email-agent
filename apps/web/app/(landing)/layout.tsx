import { Suspense } from "react";
import {
  ConversionAnalyticsScript,
  ConversionQueryParamEvents,
} from "@/components/ConversionAnalytics";
import { ThemeProvider } from "@/components/theme-provider";
import { LemonScript } from "@/utils/scripts/lemon";

export default async function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="landing-theme"
      themes={["light", "premium"]}
    >
      {children}
      <Suspense>
        <ConversionQueryParamEvents />
      </Suspense>
      <ConversionAnalyticsScript />
      <LemonScript />
    </ThemeProvider>
  );
}
