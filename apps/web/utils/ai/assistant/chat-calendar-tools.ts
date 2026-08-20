import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { posthogCaptureEvent } from "@/utils/posthog";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";

const getCalendarEventsInputSchema = z.object({
  startDate: z
    .string()
    .describe(
      "Start of date range in ISO 8601 format (e.g. 2026-03-18T00:00:00Z)",
    ),
  endDate: z
    .string()
    .describe(
      "End of date range in ISO 8601 format (e.g. 2026-03-19T00:00:00Z)",
    ),
  maxResults: z
    .number()
    .optional()
    .describe("Maximum number of events to return. Defaults to 25."),
});

export const getCalendarEventsTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Fetch calendar events for a date range across every calendar the user has connected (Google and Outlook), merged and sorted by start time. Returns each event's title, start and end time, location, attendee email addresses, and video conference link. READ-ONLY: this tool cannot create, move, cancel, or respond to events, and no other tool can either - there is no way to write to the user's calendar from chat. When the user asks to schedule, reschedule, or cancel something, use this to check what they already have on, then say plainly that they need to make the change in their own calendar app, or offer to draft an email proposing the times. Never imply that an event was created, moved, held, or blocked out. startDate and endDate are ISO 8601 timestamps and must be resolved from the user's timezone before calling. maxResults defaults to 25 and caps the merged list: when truncated is true, more events fall in the range than were returned, so do not describe the result as their full schedule. When partialFailure is true at least one connected calendar could not be reached, so the events are an incomplete picture of that range - say so rather than presenting them as everything, and never conclude that a slot is free from a partial result. If no calendar is connected the tool returns an error; tell the user to connect one on the Calendars page instead of guessing at their availability.",
    inputSchema: getCalendarEventsInputSchema,
    execute: async ({ startDate, endDate, maxResults }) => {
      trackToolCall({ tool: "get_calendar_events", email, logger });

      try {
        const providers = await createCalendarEventProviders(
          emailAccountId,
          logger,
        );

        if (providers.length === 0) {
          return {
            error:
              "No calendar connected. The user needs to connect their calendar in Zynbox settings.",
          };
        }

        const allResults = await Promise.allSettled(
          providers.map((provider) =>
            provider.fetchEvents({
              timeMin: new Date(startDate),
              timeMax: new Date(endDate),
              maxResults: maxResults ?? 25,
            }),
          ),
        );

        const fulfilled = allResults.filter(
          (r): r is PromiseFulfilledResult<CalendarEvent[]> =>
            r.status === "fulfilled",
        );
        const rejectedCount = allResults.length - fulfilled.length;

        if (rejectedCount > 0) {
          logger.warn("Some calendar providers failed", {
            count: rejectedCount,
          });
        }

        if (fulfilled.length === 0) {
          return {
            error:
              "All calendar providers failed to fetch events. Please try again later.",
          };
        }

        const limit = maxResults ?? 25;
        const merged = fulfilled
          .flatMap((r) => r.value)
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

        const events = merged.slice(0, limit).map((event) => ({
          title: event.title,
          startTime: event.startTime.toISOString(),
          endTime: event.endTime.toISOString(),
          location: event.location ?? null,
          attendees: event.attendees.map((a) => a.email),
          videoConferenceLink: event.videoConferenceLink ?? null,
        }));

        // A provider that fails is only logged, so without these flags the
        // model presents half a schedule as the whole one and calls a slot
        // free when the calendar holding the conflict never answered.
        return {
          events,
          count: events.length,
          truncated: merged.length > limit,
          partialFailure: rejectedCount > 0,
        };
      } catch (error) {
        logger.error("Failed to fetch calendar events", { error });
        return { error: "Failed to fetch calendar events" };
      }
    },
  });

export type GetCalendarEventsTool = InferUITool<
  ReturnType<typeof getCalendarEventsTool>
>;

async function trackToolCall({
  tool: toolName,
  email,
  logger,
}: {
  tool: string;
  email: string;
  logger: Logger;
}) {
  logger.trace("Tracking tool call", { tool: toolName, email });
  return posthogCaptureEvent(email, "AI Assistant Chat Tool Call", {
    tool: toolName,
  });
}
