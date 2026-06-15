-- Add clerk_id column for Clerk authentication sync
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clerk_id" TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS "User_clerk_id_idx" ON "User" ("clerk_id");
