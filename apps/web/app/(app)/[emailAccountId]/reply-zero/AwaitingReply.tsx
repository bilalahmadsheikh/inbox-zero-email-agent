import { ThreadTrackerType } from "@/generated/prisma/enums";
import { ReplyTrackerEmails } from "./ReplyTrackerEmails";
import { getPaginatedThreadTrackers } from "./fetch-trackers";
import type { TimeRange } from "./date-filter";
import { isAnalyzingReplyTracker } from "@/utils/redis/reply-tracker-analyzing";

export async function AwaitingReply({
  emailAccountId,
  userEmail,
  page,
  timeRange,
}: {
  emailAccountId: string;
  userEmail: string;
  page: number;
  timeRange: TimeRange;
}) {
  const { trackers, totalPages } = await getPaginatedThreadTrackers({
    emailAccountId,
    type: ThreadTrackerType.AWAITING,
    page,
    timeRange,
  });

  // The "analysing" flag only changes what an empty list says, so Redis is
  // only asked when there is nothing to show.
  const isAnalyzing =
    trackers.length === 0 &&
    (await isAnalyzingReplyTracker({ emailAccountId }));

  return (
    <ReplyTrackerEmails
      trackers={trackers}
      emailAccountId={emailAccountId}
      userEmail={userEmail}
      type={ThreadTrackerType.AWAITING}
      totalPages={totalPages}
      isAnalyzing={isAnalyzing}
    />
  );
}
