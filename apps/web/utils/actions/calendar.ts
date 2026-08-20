"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  confirmCalendarEventBody,
  disconnectCalendarBody,
  toggleCalendarBody,
  updateTimezoneBody,
  updateBookingLinkBody,
} from "@/utils/actions/calendar.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { createCalendarEvent } from "@/utils/calendar/event-writer";
import { BookingLinkLocationType } from "@/generated/prisma/enums";

export const disconnectCalendarAction = actionClient
  .metadata({ name: "disconnectCalendar" })
  .inputSchema(disconnectCalendarBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      const connection = await prisma.calendarConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        throw new SafeError("Calendar connection not found");
      }

      await prisma.calendarConnection.delete({
        where: { id: connectionId },
      });

      return { success: true };
    },
  );

export const toggleCalendarAction = actionClient
  .metadata({ name: "toggleCalendar" })
  .inputSchema(toggleCalendarBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { calendarId, isEnabled },
    }) => {
      const updatedCalendar = await prisma.calendar.updateMany({
        where: {
          id: calendarId,
          connection: {
            emailAccountId,
          },
        },
        data: { isEnabled },
      });

      if (updatedCalendar.count === 0) {
        throw new SafeError("Calendar not found");
      }

      return { success: true };
    },
  );

export const updateEmailAccountTimezoneAction = actionClient
  .metadata({ name: "updateTimezone" })
  .inputSchema(updateTimezoneBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { timezone } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { timezone },
    });
  });

export const updateCalendarBookingLinkAction = actionClient
  .metadata({ name: "updateBookingLink" })
  .inputSchema(updateBookingLinkBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { bookingLink } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { calendarBookingLink: bookingLink || null },
    });
  });

// Writes the event the chat prepared as a pending card. The user's click on
// that card is the authorization: creating an event mails every attendee an
// invitation that cannot be recalled, so nothing is written until this runs.
export const confirmCalendarEventAction = actionClient
  .metadata({ name: "confirmCalendarEvent" })
  .inputSchema(confirmCalendarEventBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { title, startTime, endTime, attendees, description },
    }) => {
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new SafeError("Could not read the event times.");
      }

      if (end.getTime() <= start.getTime()) {
        throw new SafeError("The end time must be after the start time.");
      }

      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { timezone: true },
      });

      const createdEvent = await createCalendarEvent({
        emailAccountId,
        title,
        description: description ?? undefined,
        startTime: start,
        endTime: end,
        timezone: emailAccount?.timezone || "UTC",
        attendees: attendees.map((email) => ({ email })),
        // Events created from chat have no venue; NONE keeps both providers
        // from attaching a conference link or a location line.
        locationType: BookingLinkLocationType.NONE,
        logger,
      });

      return { success: true, eventId: createdEvent.id };
    },
  );
