"use client";

import { XIcon } from "lucide-react";
import { useLocalStorage } from "usehooks-ts";
import { Button } from "@/components/ui/button";

export function BetaBanner() {
  // Deliberately a plain strip rather than the shared Banner component: that
  // one is a marketing hero (py-32, an animated scene, hard-coded light-theme
  // greys) and cost roughly a quarter of the viewport above the email list.
  const [dismissed, setDismissed] = useLocalStorage(
    "mailBetaBannerDismissed",
    false,
  );

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-2 border-border border-b bg-muted/40 px-4 py-2 text-muted-foreground text-sm">
      <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground text-xs">
        Beta
      </span>
      <span className="min-w-0 flex-1 truncate">
        Mail is in beta. It is not intended to replace your email client.
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss beta notice"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
