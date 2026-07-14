-- Link recurring occurrences to their chain root for whole-chain cancel
ALTER TABLE "ScheduledEmail" ADD COLUMN "chainRootId" TEXT;
CREATE INDEX "ScheduledEmail_emailAccountId_chainRootId_idx" ON "ScheduledEmail"("emailAccountId", "chainRootId");
