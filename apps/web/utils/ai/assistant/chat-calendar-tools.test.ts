import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCalendarEventTool,
  getCalendarEventsTool,
} from "@/utils/ai/assistant/chat-calendar-tools";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import { createScopedLogger } from "@/utils/logger";

vi.mock("@/utils/calendar/event-provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const logger = createScopedLogger("chat-calendar-tools-test");

const buildTool = () =>
  getCalendarEventsTool({
    email: "user@example.com",
    emailAccountId: "email-account-1",
    logger,
  });

const range = {
  startDate: "2026-03-18T00:00:00Z",
  endDate: "2026-03-19T00:00:00Z",
};

function buildEvent(offsetHours: number) {
  const start = new Date(Date.UTC(2026, 2, 18, offsetHours, 0, 0));
  return {
    title: `Event ${offsetHours}`,
    startTime: start,
    endTime: new Date(start.getTime() + 60 * 60 * 1000),
    location: null,
    attendees: [],
    videoConferenceLink: null,
  };
}

describe("getCalendarEventsTool", () => {
  beforeEach(() => {
    vi.mocked(createCalendarEventProviders).mockReset();
  });

  it("reports a partial failure when one connected calendar cannot be reached", async () => {
    vi.mocked(createCalendarEventProviders).mockResolvedValue([
      { fetchEvents: vi.fn().mockResolvedValue([buildEvent(9)]) },
      { fetchEvents: vi.fn().mockRejectedValue(new Error("provider down")) },
    ] as never);

    const result = await (buildTool().execute as any)(range);

    // The surviving provider's events must still come back, but flagged, so
    // the assistant cannot call a slot free using half the calendars.
    expect(result.partialFailure).toBe(true);
    expect(result.count).toBe(1);
  });

  it("does not flag a partial failure when every calendar answers", async () => {
    vi.mocked(createCalendarEventProviders).mockResolvedValue([
      { fetchEvents: vi.fn().mockResolvedValue([buildEvent(9)]) },
      { fetchEvents: vi.fn().mockResolvedValue([buildEvent(11)]) },
    ] as never);

    const result = await (buildTool().execute as any)(range);

    expect(result.partialFailure).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.count).toBe(2);
  });

  it("flags truncation when more events fall in the range than were returned", async () => {
    vi.mocked(createCalendarEventProviders).mockResolvedValue([
      {
        fetchEvents: vi
          .fn()
          .mockResolvedValue([buildEvent(9), buildEvent(11), buildEvent(13)]),
      },
    ] as never);

    const result = await (buildTool().execute as any)({
      ...range,
      maxResults: 2,
    });

    expect(result.truncated).toBe(true);
    expect(result.count).toBe(2);
  });

  it("returns an error when no calendar is connected", async () => {
    vi.mocked(createCalendarEventProviders).mockResolvedValue([] as never);

    const result = await (buildTool().execute as any)(range);

    expect(result.error).toBeTruthy();
    expect(result.events).toBeUndefined();
  });
});

describe("createCalendarEventTool", () => {
  const buildCreateTool = () =>
    createCalendarEventTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
    });

  const validInput = {
    title: "Design review",
    startDate: "2026-03-18T14:00:00Z",
    endDate: "2026-03-18T15:00:00Z",
  };

  beforeEach(() => {
    vi.mocked(createCalendarEventProviders).mockReset();
    vi.mocked(createCalendarEventProviders).mockResolvedValue([
      { fetchEvents: vi.fn() },
    ] as never);
  });

  it("returns a pending confirmation instead of creating the event", async () => {
    const result = await (buildCreateTool().execute as any)({
      ...validInput,
      attendees: ["Sarah <SARAH@example.com>"],
    });

    expect(result).toMatchObject({
      actionType: "create_calendar_event",
      requiresConfirmation: true,
      confirmationState: "pending",
      title: "Design review",
      attendees: ["sarah@example.com"],
      attendeesCount: 1,
    });
  });

  it("rejects an end time that is not after the start", async () => {
    const result = await (buildCreateTool().execute as any)({
      ...validInput,
      endDate: "2026-03-18T14:00:00Z",
    });

    expect(result.error).toBeTruthy();
    expect(result.requiresConfirmation).toBeUndefined();
  });

  it("rejects unparseable times", async () => {
    const result = await (buildCreateTool().execute as any)({
      ...validInput,
      startDate: "next tuesday",
    });

    expect(result.error).toBeTruthy();
    expect(result.requiresConfirmation).toBeUndefined();
  });

  it("refuses when no calendar is connected", async () => {
    vi.mocked(createCalendarEventProviders).mockResolvedValue([] as never);

    const result = await (buildCreateTool().execute as any)(validInput);

    expect(result.error).toBeTruthy();
    expect(result.requiresConfirmation).toBeUndefined();
  });

  it("drops malformed attendees and de-duplicates the rest", async () => {
    const result = await (buildCreateTool().execute as any)({
      ...validInput,
      attendees: [
        "sarah@example.com",
        "Sarah <sarah@example.com>",
        "Marketing",
      ],
    });

    expect(result.attendees).toEqual(["sarah@example.com"]);
  });
});
