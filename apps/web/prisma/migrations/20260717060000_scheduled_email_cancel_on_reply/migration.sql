-- One-time stop condition for scheduled chains: a reply from the recipient
-- cancels the remaining sends, without creating a standing rule.
ALTER TABLE "ScheduledEmail" ADD COLUMN "cancelOnReply" BOOLEAN NOT NULL DEFAULT false;
