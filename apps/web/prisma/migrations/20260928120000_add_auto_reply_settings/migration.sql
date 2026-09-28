-- Separate controls for replies the AI sends on its own. Additive only.
-- autoReplyEnabled defaults to true so existing send rules keep sending;
-- autoReplyConfidence defaults to HIGH_CONFIDENCE, so an uncertain AI reply
-- becomes a draft rather than going out.
ALTER TABLE "EmailAccount" ADD COLUMN "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EmailAccount" ADD COLUMN "autoReplyConfidence" "DraftReplyConfidence" NOT NULL DEFAULT 'HIGH_CONFIDENCE';
