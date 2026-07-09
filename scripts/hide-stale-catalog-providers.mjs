#!/usr/bin/env node
/**
 * Hide Eros/Tryst catalog providers not seen in a scan for 15+ days.
 * Soft-hide only: status=inactive, rows remain in DB.
 */

import {
  CATALOG_STALE_GRACE_DAYS,
  CATALOG_STALE_HIDE_NOTE,
  catalogStaleCutoff,
  IMPORTED_CATALOG_SYNC_SOURCES,
} from "./lib/catalog-sync-policy.mjs";

const dryRun = process.argv.includes("--dry-run");
const graceDays = Number(
  process.argv.find((a) => a.startsWith("--grace-days="))?.split("=")[1] ?? CATALOG_STALE_GRACE_DAYS,
);

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  try {
    const generated = await dynamicImport("../backend/generated/prisma-client/index.js");
    if (generated?.PrismaClient) return new generated.PrismaClient();
  } catch {
    // fallback
  }
  const runtime = await dynamicImport("@prisma/client");
  if (!runtime?.PrismaClient) throw new Error("PrismaClient not available. Run `npm run db:generate`.");
  return new runtime.PrismaClient();
}

const prisma = await createPrismaClient();
const cutoff = catalogStaleCutoff(new Date(), graceDays);

try {
  const stale = await prisma.provider.findMany({
    where: {
      verification_provider: { in: [...IMPORTED_CATALOG_SYNC_SOURCES] },
      status: "active",
      last_seen_at: { not: null, lt: cutoff },
    },
    select: { id: true, display_name: true, verification_url: true, last_seen_at: true },
  });

  let hidden = 0;
  for (const row of stale) {
    console.log(
      `[hide-stale] ${dryRun ? "[dry-run] would hide" : "hiding"} ${row.display_name} (${row.id}) last_seen=${row.last_seen_at?.toISOString?.() ?? row.last_seen_at}`,
    );
    if (!dryRun) {
      await prisma.provider.update({
        where: { id: row.id },
        data: {
          status: "inactive",
          admin_notes: CATALOG_STALE_HIDE_NOTE,
          updated_date: new Date(),
        },
      });
    }
    hidden += 1;
  }

  console.log(
    JSON.stringify({
      dryRun,
      graceDays,
      cutoff: cutoff.toISOString(),
      hidden,
    }),
  );
} finally {
  await prisma.$disconnect();
}
