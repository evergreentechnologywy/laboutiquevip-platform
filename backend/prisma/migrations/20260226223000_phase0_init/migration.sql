CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL UNIQUE,
  "role" TEXT NOT NULL DEFAULT 'member',
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id"),
  "display_name" TEXT NOT NULL,
  "bio" TEXT,
  "city" TEXT,
  "country" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "profile_photos" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "storage_key" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "profile_tours" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "video_url" TEXT NOT NULL,
  "title" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "tags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "profile_tags" (
  "profile_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "tag_id" UUID NOT NULL REFERENCES "tags"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("profile_id", "tag_id")
);

CREATE TABLE "verifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id"),
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "submitted_at" TIMESTAMPTZ,
  "reviewed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "verification_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "verification_id" UUID NOT NULL REFERENCES "verifications"("id"),
  "event_type" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "products" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "sku" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "orders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id"),
  "product_id" UUID NOT NULL REFERENCES "products"("id"),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "invoices" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL REFERENCES "orders"("id"),
  "external_ref" TEXT UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "issued_at" TIMESTAMPTZ,
  "paid_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "invoice_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_id" UUID NOT NULL REFERENCES "invoices"("id"),
  "event_type" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "entitlements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL REFERENCES "orders"("id"),
  "entitlement" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "granted_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "revoked_at" TIMESTAMPTZ,
  "metadata" JSONB
);

CREATE TABLE "reports" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporter_id" UUID NOT NULL REFERENCES "users"("id"),
  "target_user_id" UUID REFERENCES "users"("id"),
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "details" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolved_at" TIMESTAMPTZ
);

CREATE TABLE "blocks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "blocker_id" UUID NOT NULL REFERENCES "users"("id"),
  "blocked_user_id" UUID NOT NULL REFERENCES "users"("id"),
  "reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("blocker_id", "blocked_user_id")
);

CREATE TABLE "audit_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" UUID REFERENCES "users"("id"),
  "action" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT,
  "payload" JSONB,
  "request_id" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_profiles_user_id" ON "profiles" ("user_id");
CREATE INDEX "idx_profile_photos_profile_id" ON "profile_photos" ("profile_id");
CREATE INDEX "idx_profile_tours_profile_id" ON "profile_tours" ("profile_id");
CREATE INDEX "idx_verifications_user_id" ON "verifications" ("user_id");
CREATE INDEX "idx_verification_events_verification_id" ON "verification_events" ("verification_id");
CREATE INDEX "idx_products_profile_id" ON "products" ("profile_id");
CREATE INDEX "idx_orders_user_id" ON "orders" ("user_id");
CREATE INDEX "idx_orders_product_id" ON "orders" ("product_id");
CREATE INDEX "idx_invoices_order_id" ON "invoices" ("order_id");
CREATE INDEX "idx_invoice_events_invoice_id" ON "invoice_events" ("invoice_id");
CREATE INDEX "idx_entitlements_order_id" ON "entitlements" ("order_id");
CREATE INDEX "idx_reports_reporter_id" ON "reports" ("reporter_id");
CREATE INDEX "idx_reports_target_user_id" ON "reports" ("target_user_id");
CREATE INDEX "idx_blocks_blocker_id" ON "blocks" ("blocker_id");
CREATE INDEX "idx_blocks_blocked_user_id" ON "blocks" ("blocked_user_id");
CREATE INDEX "idx_audit_events_actor_id" ON "audit_events" ("actor_id");
CREATE INDEX "idx_audit_events_resource_type_resource_id" ON "audit_events" ("resource_type", "resource_id");
