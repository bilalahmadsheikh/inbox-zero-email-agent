import { z } from "zod";

export const disconnectCalendarBody = z.object({
  connectionId: z.string(),
});
export type DisconnectCalendarBody = z.infer<typeof disconnectCalendarBody>;

export const toggleCalendarBody = z.object({
  calendarId: z.string(),
  isEnabled: z.boolean(),
});
export type ToggleCalendarBody = z.infer<typeof toggleCalendarBody>;

export const updateTimezoneBody = z.object({
  timezone: z.string().min(1, "Timezone is required"),
});
export type UpdateTimezoneBody = z.infer<typeof updateTimezoneBody>;

export const updateBookingLinkBody = z.object({
  bookingLink: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
});
export type UpdateBookingLinkBody = z.infer<typeof updateBookingLinkBody>;

export const confirmCalendarEventBody = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  attendees: z.array(z.string().email()).max(50).default([]),
  description: z.string().max(5000).nullish(),
});
export type ConfirmCalendarEventBody = z.infer<typeof confirmCalendarEventBody>;
