"use client";

import { useCallback } from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { setLastEmailAccountAction } from "@/utils/actions/email-account-cookie";
import { ProfileImage } from "@/components/ProfileImage";
import { redirectToSafeUrl } from "@/utils/redirect";

// Account switching entries embedded in the NavUser dropdown at the bottom
// of the sidebar. Renders its own trailing separator so it collapses cleanly
// while accounts are loading.
export function AccountSwitcherMenuItems() {
  const { data: accountsData } = useAccounts();
  const { emailAccountId: activeEmailAccountId } = useAccount();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ emailAccountId?: string }>();

  const getHref = useCallback(
    (emailAccountId: string) => {
      if (!activeEmailAccountId) return `/${emailAccountId}/setup`;

      const basePath = pathname.split("?")[0] || "/";
      const tab = searchParams.get("tab");

      if (params.emailAccountId) {
        const segments = basePath.split("/").filter(Boolean);
        if (segments[0] === params.emailAccountId) {
          segments[0] = emailAccountId;
          const newBasePath = `/${segments.join("/")}`;
          return `${newBasePath}${tab ? `?tab=${tab}` : ""}`;
        }
      }

      return `${basePath}${tab ? `?tab=${tab}` : ""}`;
    },
    [pathname, activeEmailAccountId, params.emailAccountId, searchParams],
  );

  const handleSelect = useCallback(
    async (emailAccountId: string) => {
      try {
        await setLastEmailAccountAction({ emailAccountId });
      } catch {
        // Ignore cookie update failures and continue navigation.
      }

      // Force a hard page reload to refresh all data.
      // I tried to fix with resetting the SWR cache but it didn't seem to work. This is much more reliable anyway.
      redirectToSafeUrl(getHref(emailAccountId));
    },
    [getHref],
  );

  if (!accountsData) return null;

  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        Accounts
      </DropdownMenuLabel>
      {accountsData.emailAccounts.map((emailAccount) => (
        <DropdownMenuItem
          key={emailAccount.id}
          className="gap-2 p-2"
          onSelect={() => {
            handleSelect(emailAccount.id);
          }}
        >
          <ProfileImage
            image={emailAccount.image}
            label={emailAccount.name || emailAccount.email}
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">
              {emailAccount.name || emailAccount.email}
            </span>
            {emailAccount.name && (
              <span className="truncate text-xs text-muted-foreground">
                {emailAccount.email}
              </span>
            )}
          </div>
        </DropdownMenuItem>
      ))}
      <Link href="/accounts">
        <DropdownMenuItem className="gap-2 p-2">
          <div className="flex size-6 items-center justify-center rounded-md border bg-background">
            <Plus className="size-4" />
          </div>
          <div className="font-medium text-muted-foreground">
            Add or manage accounts
          </div>
        </DropdownMenuItem>
      </Link>
      <DropdownMenuSeparator />
    </>
  );
}
