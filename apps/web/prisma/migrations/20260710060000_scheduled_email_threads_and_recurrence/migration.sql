-- Thread-aware and recurring scheduled emails
ALTER TABLE "ScheduledEmail" ADD COLUMN "threadId" TEXT;
ALTER TABLE "ScheduledEmail" ADD COLUMN "repeatEveryMinutes" INTEGER;
ALTER TABLE "ScheduledEmail" ADD COLUMN "maxOccurrences" INTEGER;
ALTER TABLE "ScheduledEmail" ADD COLUMN "occurrence" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "ScheduledEmail_emailAccountId_threadId_idx" ON "ScheduledEmail"("emailAccountId", "threadId");
