-- Add missing foreign-key indexes (join/filter performance on hot paths).
-- IF NOT EXISTS makes this safe to re-run and safe where an index already
-- exists outside of prisma migrate.

CREATE INDEX IF NOT EXISTS "profiles_user_id_idx" ON "profiles" ("user_id");
CREATE INDEX IF NOT EXISTS "profile_photos_profile_id_idx" ON "profile_photos" ("profile_id");
CREATE INDEX IF NOT EXISTS "profile_tours_profile_id_idx" ON "profile_tours" ("profile_id");
CREATE INDEX IF NOT EXISTS "profile_tags_tag_id_idx" ON "profile_tags" ("tag_id");
CREATE INDEX IF NOT EXISTS "verifications_user_id_idx" ON "verifications" ("user_id");
CREATE INDEX IF NOT EXISTS "verification_events_verification_id_idx" ON "verification_events" ("verification_id");
CREATE INDEX IF NOT EXISTS "products_profile_id_idx" ON "products" ("profile_id");
CREATE INDEX IF NOT EXISTS "orders_user_id_idx" ON "orders" ("user_id");
CREATE INDEX IF NOT EXISTS "orders_product_id_idx" ON "orders" ("product_id");
CREATE INDEX IF NOT EXISTS "invoices_order_id_idx" ON "invoices" ("order_id");
CREATE INDEX IF NOT EXISTS "invoice_events_invoice_id_idx" ON "invoice_events" ("invoice_id");
CREATE INDEX IF NOT EXISTS "entitlements_order_id_idx" ON "entitlements" ("order_id");
CREATE INDEX IF NOT EXISTS "reports_reporter_id_idx" ON "reports" ("reporter_id");
CREATE INDEX IF NOT EXISTS "reports_target_user_id_idx" ON "reports" ("target_user_id");
CREATE INDEX IF NOT EXISTS "blocks_blocked_user_id_idx" ON "blocks" ("blocked_user_id");
CREATE INDEX IF NOT EXISTS "audit_events_actor_id_idx" ON "audit_events" ("actor_id");
