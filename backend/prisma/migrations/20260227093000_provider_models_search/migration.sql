CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS "provider_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE REFERENCES "users"("id"),
  "slug" TEXT NOT NULL UNIQUE,
  "display_name" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "city_slug" TEXT NOT NULL,
  "bio" TEXT,
  "services" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "rates" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "contact_preferences" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "is_published" BOOLEAN NOT NULL DEFAULT FALSE,
  "published_at" TIMESTAMPTZ,
  "is_verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "model_tags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "provider_profile_tags" (
  "profile_id" UUID NOT NULL REFERENCES "provider_profiles"("id") ON DELETE CASCADE,
  "tag_id" UUID NOT NULL REFERENCES "model_tags"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("profile_id", "tag_id")
);

CREATE TABLE IF NOT EXISTS "provider_availability_blocks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL REFERENCES "provider_profiles"("id") ON DELETE CASCADE,
  "city" TEXT NOT NULL,
  "city_slug" TEXT NOT NULL,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "is_available" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "provider_availability_blocks_valid_range" CHECK ("starts_at" <= "ends_at")
);

CREATE TABLE IF NOT EXISTS "provider_tours" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL REFERENCES "provider_profiles"("id") ON DELETE CASCADE,
  "city" TEXT NOT NULL,
  "city_slug" TEXT NOT NULL,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "provider_tours_valid_range" CHECK ("starts_at" <= "ends_at")
);

CREATE INDEX IF NOT EXISTS "idx_provider_profiles_city" ON "provider_profiles" ("city");
CREATE INDEX IF NOT EXISTS "idx_provider_profiles_city_slug" ON "provider_profiles" ("city_slug");
CREATE INDEX IF NOT EXISTS "idx_provider_profiles_published_verified" ON "provider_profiles" ("is_published", "is_verified");
CREATE INDEX IF NOT EXISTS "idx_provider_profiles_city_prefix" ON "provider_profiles" (lower("city") text_pattern_ops);
CREATE INDEX IF NOT EXISTS "idx_provider_profiles_city_trgm" ON "provider_profiles" USING GIN (lower("city") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_provider_profile_tags_tag_id" ON "provider_profile_tags" ("tag_id");

CREATE INDEX IF NOT EXISTS "idx_provider_availability_profile_range" ON "provider_availability_blocks" ("profile_id", "starts_at", "ends_at");
CREATE INDEX IF NOT EXISTS "idx_provider_availability_city_range" ON "provider_availability_blocks" ("city_slug", "starts_at");
CREATE INDEX IF NOT EXISTS "idx_provider_availability_city_prefix" ON "provider_availability_blocks" (lower("city") text_pattern_ops);
CREATE INDEX IF NOT EXISTS "idx_provider_availability_city_trgm" ON "provider_availability_blocks" USING GIN (lower("city") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_provider_tours_profile_range" ON "provider_tours" ("profile_id", "starts_at", "ends_at");
CREATE INDEX IF NOT EXISTS "idx_provider_tours_city_range" ON "provider_tours" ("city_slug", "starts_at");
CREATE INDEX IF NOT EXISTS "idx_provider_tours_city_prefix" ON "provider_tours" (lower("city") text_pattern_ops);
CREATE INDEX IF NOT EXISTS "idx_provider_tours_city_trgm" ON "provider_tours" USING GIN (lower("city") gin_trgm_ops);
