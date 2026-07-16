-- Cancel intent for rows the executor has claimed (SENDING): a failed send
-- is cancelled instead of retried, and a recurring chain stops instead of
-- queueing its next occurrence.
ALTER TABLE "ScheduledEmail" ADD COLUMN "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
