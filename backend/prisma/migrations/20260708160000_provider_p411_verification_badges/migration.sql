-- P411 + review verification badge timestamps for public catalog gate
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "p411_url" TEXT;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "p411_id" TEXT;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "p411_verified_at" TIMESTAMP(3);
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "review_verified_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Provider_p411_verified_at_idx" ON "Provider"("p411_verified_at");
CREATE INDEX IF NOT EXISTS "Provider_review_verified_at_idx" ON "Provider"("review_verified_at");
