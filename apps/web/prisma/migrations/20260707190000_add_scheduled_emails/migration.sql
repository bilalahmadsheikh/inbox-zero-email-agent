-- CreateEnum
CREATE TYPE "ScheduledEmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "ScheduledEmail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "bcc" TEXT,
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "messageHtml" TEXT NOT NULL,
    "replyToEmail" JSONB,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledEmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentMessageId" TEXT,
    "sentThreadId" TEXT,
    "error" TEXT,

    CONSTRAINT "ScheduledEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledEmail_status_sendAt_idx" ON "ScheduledEmail"("status", "sendAt");

-- CreateIndex
CREATE INDEX "ScheduledEmail_emailAccountId_status_idx" ON "ScheduledEmail"("emailAccountId", "status");

-- AddForeignKey
ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
