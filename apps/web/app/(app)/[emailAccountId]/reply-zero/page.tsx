import { redirect } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircleIcon, ClockIcon, MailIcon } from "lucide-react";
import { NeedsReply } from "./NeedsReply";
import { Resolved } from "./Resolved";
import { AwaitingReply } from "./AwaitingReply";
import prisma from "@/utils/prisma";
import { TimeRangeFilter } from "./TimeRangeFilter";
import type { TimeRange } from "./date-filter";
import { TabsToolbar } from "@/components/TabsToolbar";
import { GmailProvider } from "@/providers/GmailProvider";
import { cookies } from "next/headers";
import { REPLY_ZERO_ONBOARDING_COOKIE } from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import { auth } from "@/utils/auth";
import { CONVERSATION_STATUS_TYPES } from "@/utils/reply-tracker/conversation-status-config";

export const maxDuration = 300;

export default async function ReplyTrackerPage(props: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{
    page?: string;
    timeRange?: TimeRange;
    enabled?: boolean;
    tab?: string;
  }>;
}) {
  const { emailAccountId } = await props.params;

  const session = await auth();
  const userId = session?.user.id;
  if (!userId) throw new Error("Not authenticated");

  // One query proves ownership and loads what the page needs. This used to be
  // an ownership check followed by a second read of the same account.
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId, userId },
    select: {
      email: true,
      rules: {
        where: {
          systemType: {
            in: CONVERSATION_STATUS_TYPES,
          },
          enabled: true,
        },
        select: { id: true },
      },
    },
  });

  if (!emailAccount) redirect("/no-access");

  const searchParams = await props.searchParams;
  const activeTab = getReplyZeroTab(searchParams.tab);

  const cookieStore = await cookies();
  const viewedOnboarding =
    cookieStore.get(REPLY_ZERO_ONBOARDING_COOKIE)?.value === "true";

  if (!viewedOnboarding)
    redirect(prefixPath(emailAccountId, "/reply-zero/onboarding"));

  const trackerRule = emailAccount.rules[0];

  if (!trackerRule)
    redirect(prefixPath(emailAccountId, "/reply-zero/onboarding"));

  const page = Number(searchParams.page || "1");
  const timeRange = searchParams.timeRange || "all";

  return (
    <GmailProvider>
      <Tabs defaultValue={activeTab} className="flex h-full flex-col">
        <TabsToolbar>
          <div className="w-full overflow-x-auto">
            <div className="flex items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger
                  value="needsReply"
                  className="flex items-center gap-2"
                >
                  <MailIcon className="h-4 w-4" />
                  To Reply
                </TabsTrigger>
                <TabsTrigger
                  value="awaitingReply"
                  className="flex items-center gap-2"
                >
                  <ClockIcon className="h-4 w-4" />
                  Waiting
                </TabsTrigger>
                {/* <TabsTrigger
                value="needsAction"
                className="flex items-center gap-2"
              >
                <AlertCircleIcon className="h-4 w-4" />
                Needs Action
              </TabsTrigger> */}

                <TabsTrigger
                  value="resolved"
                  className="flex items-center gap-2"
                >
                  <CheckCircleIcon className="size-4" />
                  Done
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <TimeRangeFilter />
              </div>
            </div>
          </div>
        </TabsToolbar>

        {/* Only the visible tab is built. Each tab is a link, so switching
            tabs is already a server round trip; building all three on every
            request ran three tabs' worth of queries at once to show one. */}
        <TabsContent value={activeTab} className="mt-0 flex-1">
          <ReplyZeroTabContent
            tab={activeTab}
            emailAccountId={emailAccountId}
            userEmail={emailAccount.email}
            page={page}
            timeRange={timeRange}
          />
        </TabsContent>
      </Tabs>
    </GmailProvider>
  );
}

// Deep links (e.g. from the digest) can target a specific tab.
function getReplyZeroTab(tab: string | undefined) {
  if (tab === "awaitingReply" || tab === "resolved") return tab;
  return "needsReply";
}

function ReplyZeroTabContent({
  tab,
  ...props
}: {
  tab: ReturnType<typeof getReplyZeroTab>;
  emailAccountId: string;
  userEmail: string;
  page: number;
  timeRange: TimeRange;
}) {
  switch (tab) {
    case "awaitingReply":
      return <AwaitingReply {...props} />;
    case "resolved":
      return <Resolved {...props} />;
    default:
      return <NeedsReply {...props} />;
  }
}
