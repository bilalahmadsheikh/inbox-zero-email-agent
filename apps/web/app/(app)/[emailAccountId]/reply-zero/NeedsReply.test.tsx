import { beforeEach, describe, expect, it, vi } from "vitest";
import { NeedsReply } from "./NeedsReply";
import { getPaginatedThreadTrackers } from "./fetch-trackers";
import { isAnalyzingReplyTracker } from "@/utils/redis/reply-tracker-analyzing";

vi.mock("./fetch-trackers", () => ({ getPaginatedThreadTrackers: vi.fn() }));
vi.mock("./ReplyTrackerEmails", () => ({ ReplyTrackerEmails: () => null }));
vi.mock("@/utils/redis/reply-tracker-analyzing", () => ({
  isAnalyzingReplyTracker: vi.fn(),
}));

const props = {
  emailAccountId: "account-1",
  userEmail: "me@example.com",
  page: 1,
  timeRange: "all" as const,
};

describe("NeedsReply", () => {
  beforeEach(() => {
    vi.mocked(isAnalyzingReplyTracker).mockReset();
    vi.mocked(isAnalyzingReplyTracker).mockResolvedValue(true);
  });

  it("does not ask Redis when there are emails to show", async () => {
    vi.mocked(getPaginatedThreadTrackers).mockResolvedValue({
      trackers: [{ id: "tracker-1" }],
      totalPages: 1,
    } as any);

    const element = await NeedsReply(props);

    expect(isAnalyzingReplyTracker).not.toHaveBeenCalled();
    expect(element.props.isAnalyzing).toBe(false);
  });

  it("asks Redis whether to say 'analysing' when the list is empty", async () => {
    vi.mocked(getPaginatedThreadTrackers).mockResolvedValue({
      trackers: [],
      totalPages: 0,
    } as any);

    const element = await NeedsReply(props);

    expect(isAnalyzingReplyTracker).toHaveBeenCalledTimes(1);
    expect(element.props.isAnalyzing).toBe(true);
  });
});
