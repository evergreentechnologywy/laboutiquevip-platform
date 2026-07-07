#!/usr/bin/env node
/**
 * Reactivate Eros providers wrongly deactivated by capped reconcile scrapes.
 * Only restores inactive rows that still have displayable photos (R2 or Eros CDN).
 *
 * Usage:
 *   node scripts/reactivate-eros-profiles.mjs [--dry-run]
 */

import fs from "node:fs";

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

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  for (const modulePath of [
    "../backend/generated/prisma-client/index.js",
    "/srv/apps/trystlike/repo/backend/generated/prisma-client/index.js",
  ]) {
    try {
      const generated = await dynamicImport(modulePath);
      if (generated?.PrismaClient) return new generated.PrismaClient();
    } catch {
      // try next
    }
  }
  const runtime = await dynamicImport("@prisma/client");
  if (!runtime?.PrismaClient) throw new Error("PrismaClient not available.");
  return new runtime.PrismaClient();
}

const prisma = await createPrismaClient();

const candidates = await prisma.$queryRaw`
  SELECT id, display_name, verification_url
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
         OR url ~* '(i\.eros\.com|eros\.com/i/)'
         OR url ~* '\.(jpg|jpeg|png|webp|avif|gif)(\?|$)'
    )
`;

console.log(`[reactivate-eros] candidates: ${candidates.length} (dryRun=${dryRun})`);

if (!dryRun && candidates.length > 0) {
  const result = await prisma.provider.updateMany({
    where: {
      id: { in: candidates.map((row) => row.id) },
    },
    data: {
      status: "active",
      updated_date: new Date(),
    },
  });
  console.log(`[reactivate-eros] reactivated: ${result.count}`);
} else if (dryRun) {
  for (const row of candidates.slice(0, 10)) {
    console.log(`[reactivate-eros] [dry-run] ${row.display_name} — ${row.verification_url}`);
  }
  if (candidates.length > 10) {
    console.log(`[reactivate-eros] [dry-run] ... and ${candidates.length - 10} more`);
  }
}

await prisma.$disconnect();
