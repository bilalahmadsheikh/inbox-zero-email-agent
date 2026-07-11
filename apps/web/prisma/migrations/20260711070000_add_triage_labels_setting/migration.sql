-- Opt-in mailbox labels for priority triage tiers
ALTER TABLE "EmailAccount" ADD COLUMN "triageLabelsEnabled" BOOLEAN NOT NULL DEFAULT false;
