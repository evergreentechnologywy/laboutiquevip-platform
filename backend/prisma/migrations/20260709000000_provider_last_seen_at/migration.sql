-- Catalog sync: track last Eros/Tryst scan sighting for 15-day public hide grace.
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "Provider_last_seen_at_idx" ON "Provider" ("last_seen_at");
