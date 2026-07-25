import { z } from "zod";
import { sendEmailBody } from "@/utils/gmail/mail";

export const MIN_SCHEDULE_AHEAD_MS = 60 * 1000;
export const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

// Attachments are omitted: scheduled sends store content in the database
// until send time, and attachment payloads don't belong there.
export const scheduleSendBody = sendEmailBody
  .omit({ attachments: true })
  .extend({ sendAt: z.coerce.date() })
  .refine(
    (data) => data.sendAt.getTime() >= Date.now() + MIN_SCHEDULE_AHEAD_MS,
    {
      message: "Send time must be at least a minute in the future",
      path: ["sendAt"],
    },
  )
  .refine(
    (data) => data.sendAt.getTime() <= Date.now() + MAX_SCHEDULE_AHEAD_MS,
    {
      message: "Send time can be at most 90 days in the future",
      path: ["sendAt"],
    },
  );
export type ScheduleSendBody = z.infer<typeof scheduleSendBody>;

export const cancelScheduledEmailBody = z.object({ id: z.string() });
export type CancelScheduledEmailBody = z.infer<typeof cancelScheduledEmailBody>;

export const deleteScheduledEmailBody = z.object({
  id: z.string().min(1),
});
export type DeleteScheduledEmailBody = z.infer<typeof deleteScheduledEmailBody>;

// Confirms a sender-wide cleanup the chat prepared; the user's click on the
// confirmation card is what authorizes the bulk archive / unsubscribe run.
export const confirmSenderWideInboxActionBody = z.object({
  action: z.enum([
    "bulk_archive_senders",
    "bulk_trash_senders",
    "unsubscribe_senders",
  ]),
  fromEmails: z.array(z.string().trim().min(1)).min(1).max(200),
});
export type ConfirmSenderWideInboxActionBody = z.infer<
  typeof confirmSenderWideInboxActionBody
>;
