-- Delayed REPLY actions were silently dropping replyAll (no column to carry it through)
ALTER TABLE "ScheduledAction" ADD COLUMN "replyAll" BOOLEAN;
