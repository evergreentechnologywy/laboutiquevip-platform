#!/usr/bin/env node
/**
 * Reactivate Eros providers wrongly deactivated by capped reconcile scrapes.
 * Only restores inactive rows that still have displayable photos (R2 or Eros CDN).
 *
 * Usage:
 *   node scripts/reactivate-eros-profiles.mjs [--dry-run]
 */

import fs from "node:fs";

import { createPrismaClient } from "./lib/prisma-client.mjs";

const dryRun = process.argv.includes("--dry-run");

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!(key in process.env)) process.env[key] = rest.join("=").replace(/^"|"$/g, "");
  }
}

loadEnv(new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
loadEnv("/srv/apps/trystlike/repo/.env");

const prisma = await createPrismaClient();

if (dryRun) {
  const [{ count }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "Provider"
    WHERE verification_provider = 'eros'
      AND status = 'inactive'
      AND is_profile_approved = true
      AND photos IS NOT NULL
      AND jsonb_typeof(photos::jsonb) = 'array'
      AND jsonb_array_length(photos::jsonb) > 0
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(photos::jsonb) AS url
        WHERE url LIKE '%/api/r2-photo/%'
           OR url ~* '(i\\.eros\\.com|eros\\.com/i/)'
           OR url ~* '\\.(jpg|jpeg|png|webp|avif|gif)(\\?|$)'
      )
  `;
  console.log(`[reactivate-eros] [dry-run] would reactivate: ${count}`);
} else {
  const reactivated = await prisma.$executeRaw`
    UPDATE "Provider"
    SET status = 'active', updated_date = NOW()
    WHERE verification_provider = 'eros'
      AND status = 'inactive'
      AND is_profile_approved = true
      AND photos IS NOT NULL
      AND jsonb_typeof(photos::jsonb) = 'array'
      AND jsonb_array_length(photos::jsonb) > 0
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(photos::jsonb) AS url
        WHERE url LIKE '%/api/r2-photo/%'
           OR url ~* '(i\\.eros\\.com|eros\\.com/i/)'
           OR url ~* '\\.(jpg|jpeg|png|webp|avif|gif)(\\?|$)'
      )
  `;
  console.log(`[reactivate-eros] reactivated rows: ${reactivated}`);
}

await prisma.$disconnect();
