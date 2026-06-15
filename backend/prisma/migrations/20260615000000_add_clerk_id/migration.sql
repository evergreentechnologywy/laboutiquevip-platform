-- Add clerk_id column for Clerk authentication sync
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clerk_id" TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS "users_clerk_id_idx" ON "users" ("clerk_id");
