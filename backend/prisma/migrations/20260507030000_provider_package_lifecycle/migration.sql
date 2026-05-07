ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "ad_package_started_at" TEXT;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "ad_package_expiration_reminder_sent_at" TEXT;

CREATE INDEX IF NOT EXISTS "Provider_ad_package_expiry_idx" ON "Provider" ("ad_package_expiry");
CREATE INDEX IF NOT EXISTS "Provider_ad_package_expiration_reminder_sent_at_idx" ON "Provider" ("ad_package_expiration_reminder_sent_at");
