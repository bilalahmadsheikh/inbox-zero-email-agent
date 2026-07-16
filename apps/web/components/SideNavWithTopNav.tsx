"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_VERSION } from "@/utils/changelog";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { SideNav } from "@/components/SideNav";
import { SidebarRight } from "@/components/SidebarRight";
import { cn } from "@/utils";

const CrispWithNoSSR = dynamic(() => import("@/components/CrispChat"));

function ContentWrapper({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();
  const pathname = usePathname();
  const isAssistantRoute = pathname?.includes("/assistant");
  const isRightSidebarOpen =
    !isAssistantRoute && state.includes("chat-sidebar");

  const noTopPadding = isAssistantRoute;

  return (
    <div
      className={cn(
        "flex-1 transition-all duration-200 ease-linear",
        isRightSidebarOpen && "lg:mr-[450px]",
      )}
    >
      <SidebarInset
        className={cn(
          "overflow-hidden bg-background premium-page-bg pt-9 max-w-full",
          noTopPadding && "pt-0",
        )}
      >
        {children}
      </SidebarInset>
      <Suspense>
        <CrispWithNoSSR />
      </Suspense>
    </div>
  );
}

export function SideNavWithTopNav({
  children,
  defaultOpen,
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  const pathname = usePathname();

  if (!pathname) return null;

  const isAssistantRoute = pathname.includes("/assistant");

  // Ugly code. May change the onboarding path later so we don't need to do this.
  // Only return children for the onboarding or onboarding-brief pages: /[emailAccountId]/onboarding or /[emailAccountId]/onboarding-brief
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length === 2 &&
    (segments[1] === "onboarding" || segments[1] === "onboarding-brief")
  )
    return children;

  return (
    <SidebarProvider
      defaultOpen={defaultOpen ? ["left-sidebar"] : []}
      sidebarNames={["left-sidebar", "chat-sidebar"]}
    >
      <MobileHeader />
      <ProductionVersionBadge />
      <SideNav name="left-sidebar" />
      <ContentWrapper>{children}</ContentWrapper>
      {!isAssistantRoute ? <SidebarRight name="chat-sidebar" /> : null}
    </SidebarProvider>
  );
}

function MobileHeader() {
  return (
    <header className="pointer-events-none fixed top-0 left-0 right-0 z-50 h-9 md:hidden">
      <div className="flex h-full items-center px-4">
        <SidebarTrigger
          name="left-sidebar"
          className="pointer-events-auto size-6"
        />
      </div>
    </header>
  );
}

function ProductionVersionBadge() {
  return (
    <Link
      href="/changelog"
      target="_blank"
      rel="noopener noreferrer"
      title="View the changelog"
      className="fixed top-2 right-3 z-50 rounded border border-border bg-background/90 px-2 py-0.5 font-medium text-[11px] text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
    >
      In Production Version {APP_VERSION}
    </Link>
  );
}
