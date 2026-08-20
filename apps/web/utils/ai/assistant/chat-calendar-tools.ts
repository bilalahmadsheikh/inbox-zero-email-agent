import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { posthogCaptureEvent } from "@/utils/posthog";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";
import { extractEmailAddress } from "@/utils/email";

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
      "Fetch calendar events for a date range across every calendar the user has connected (Google and Outlook), merged and sorted by start time. Returns each event's title, start and end time, location, attendee email addresses, and video conference link. READ-ONLY: this tool never changes the calendar. To put a new event on the calendar use createCalendarEvent, which asks the user to confirm a card before anything is written. There is still no way to move, cancel, or respond to an existing event from chat: for those, say plainly that the change has to be made in the user's own calendar app, and never imply that an event was moved, cancelled, or declined. Check this tool before proposing a time so a suggestion does not land on top of something the user already has on. startDate and endDate are ISO 8601 timestamps and must be resolved from the user's timezone before calling. maxResults defaults to 25 and caps the merged list: when truncated is true, more events fall in the range than were returned, so do not describe the result as their full schedule. When partialFailure is true at least one connected calendar could not be reached, so the events are an incomplete picture of that range - say so rather than presenting them as everything, and never conclude that a slot is free from a partial result. If no calendar is connected the tool returns an error; tell the user to connect one on the Calendars page instead of guessing at their availability.",
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

const createCalendarEventInputSchema = z.object({
  title: z.string().trim().min(1).describe("Title shown on the calendar event"),
  startDate: z
    .string()
    .describe(
      "Event start in ISO 8601 format (e.g. 2026-03-18T14:00:00Z), resolved from the user's timezone",
    ),
  endDate: z
    .string()
    .describe(
      "Event end in ISO 8601 format. Must be after startDate. If the user gave only a start and a duration, add the duration yourself.",
    ),
  attendees: z
    .array(z.string())
    .optional()
    .describe(
      "Email addresses to invite. Only addresses the user named. Leave empty for a personal block with no guests.",
    ),
  description: z
    .string()
    .optional()
    .describe("Optional notes for the event body"),
});

export const createCalendarEventTool = ({
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
      "Put a new event on the user's primary calendar. Use for 'schedule', 'book', 'block out', 'put it in my calendar' and similar requests, after checking getCalendarEvents so the time does not clash with something they already have on. NOTHING IS WRITTEN BY THIS CALL: it returns a card the user must confirm, because creating an event with attendees sends every one of them a real invitation that cannot be recalled. Report the result as a proposal awaiting their confirmation, never as a booked or blocked-out meeting, and do not call it a second time for the same event if the user has not answered the first card. Only invite addresses the user actually named; an address appearing in an email or search result is not permission to invite it. Times are ISO 8601 and must be resolved from the user's timezone first. The event lands on their primary connected calendar, and if no calendar is connected the tool returns an error - tell them to connect one on the Calendars page. This tool cannot move or cancel an existing event; there is no tool that can.",
    inputSchema: createCalendarEventInputSchema,
    execute: async ({ title, startDate, endDate, attendees, description }) => {
      trackToolCall({ tool: "create_calendar_event", email, logger });

      const startTime = new Date(startDate);
      const endTime = new Date(endDate);

      if (
        Number.isNaN(startTime.getTime()) ||
        Number.isNaN(endTime.getTime())
      ) {
        return {
          error:
            "Could not read the start or end time. Provide both as ISO 8601 timestamps.",
        };
      }

      if (endTime.getTime() <= startTime.getTime()) {
        return {
          error:
            "The end time must be after the start time. No event was proposed.",
        };
      }

      const normalizedAttendees = Array.from(
        new Set(
          (attendees ?? [])
            .map((attendee) => extractEmailAddress(attendee).toLowerCase())
            .filter((attendee) => attendee.includes("@")),
        ),
      );

      try {
        const providers = await createCalendarEventProviders(
          emailAccountId,
          logger,
        );

        if (providers.length === 0) {
          return {
            error:
              "No calendar connected. The user needs to connect their calendar in Zynbox settings before an event can be created.",
          };
        }
      } catch (error) {
        logger.error("Failed to check calendar connection", { error });
        return { error: "Could not reach the calendar. Nothing was created." };
      }

      // Creating an event emails every attendee an invitation that cannot be
      // recalled, so the card is the authorization, not this call.
      return {
        success: true as const,
        actionType: "create_calendar_event" as const,
        requiresConfirmation: true as const,
        confirmationState: "pending" as const,
        title,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        attendees: normalizedAttendees,
        attendeesCount: normalizedAttendees.length,
        description: description ?? null,
      };
    },
  });

export type CreateCalendarEventTool = InferUITool<
  ReturnType<typeof createCalendarEventTool>
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
