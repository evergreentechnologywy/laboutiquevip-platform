-- Review-site matching fields (TER, TheOtherBoard, PrivateDelights)
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "review_urls" JSONB;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "ter_url" TEXT;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "tob_url" TEXT;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "pd_url" TEXT;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "review_site_rating" DOUBLE PRECISION;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "review_site_count" INTEGER;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "review_matched_at" TIMESTAMP(3);
