-- Priority triage tiers with one-line AI reasons
CREATE TYPE "TriageTier" AS ENUM ('URGENT', 'IMPORTANT', 'FYI');

ALTER TABLE "ExecutedRule" ADD COLUMN "triageTier" "TriageTier";
ALTER TABLE "ExecutedRule" ADD COLUMN "triageReason" TEXT;
