-- Denormalized display fields so the Reply Zero list renders from the DB
-- without fetching each thread from the provider. Nullable; older rows stay
-- null and the list falls back to fetching for those.
ALTER TABLE "ThreadTracker" ADD COLUMN "sender" TEXT;
ALTER TABLE "ThreadTracker" ADD COLUMN "subject" TEXT;
ALTER TABLE "ThreadTracker" ADD COLUMN "snippet" TEXT;
