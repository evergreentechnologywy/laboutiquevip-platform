#!/usr/bin/env node
/**
 * Apply staged catalog scan cache to production DB (midnight merge window).
 */

import {
  readCacheRecords,
  resolveCacheDir,
  resolveLatestCacheDir,
} from "./lib/catalog-scan-cache.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

const cacheDir = args.has("cache-dir")
  ? resolveCacheDir(args.get("cache-dir"))
  : resolveLatestCacheDir();

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const stats = { created: 0, updated: 0, skipped: 0, errors: 0, verified: 0 };

function recordIsVerified(payload) {
  return Boolean(
    payload?.p411_url ||
      payload?.ter_url ||
      payload?.pd_url ||
      payload?.tob_url ||
      payload?.p411_verified_at ||
      payload?.review_verified_at,
  );
}

async function upsertRecord(record) {
  const { existingId, payload } = record;
  if (!payload?.verification_url) {
    stats.skipped += 1;
    return;
  }

  try {
    if (existingId) {
      await prisma.provider.update({ where: { id: existingId }, data: payload });
      stats.updated += 1;
      if (recordIsVerified(payload)) stats.verified += 1;
      return;
    }

    const dup = await prisma.provider.findFirst({
      where: {
        OR: [
          { verification_url: payload.verification_url },
          {
            verification_provider: payload.verification_provider,
            verification_url: payload.verification_url,
          },
        ],
      },
    });
    if (dup) {
      await prisma.provider.update({ where: { id: dup.id }, data: payload });
      stats.updated += 1;
      if (recordIsVerified(payload)) stats.verified += 1;
      return;
    }

    await prisma.provider.create({
      data: {
        ...payload,
        is_premium: payload.is_premium ?? false,
      },
    });
    stats.created += 1;
    if (recordIsVerified(payload)) stats.verified += 1;
  } catch (err) {
    stats.errors += 1;
    console.error(`[merge-cache] error ${payload.verification_url}: ${String(err)}`);
  }
}

async function main() {
  console.log(`[merge-cache] start cacheDir=${cacheDir}`);
  const eros = readCacheRecords(cacheDir, "eros");
  const tryst = readCacheRecords(cacheDir, "tryst");
  console.log(`[merge-cache] records eros=${eros.length} tryst=${tryst.length}`);

  for (const record of [...eros, ...tryst]) {
    await upsertRecord(record);
  }

  console.log("[merge-cache] complete", stats);
}

main()
  .catch((err) => {
    console.error("[merge-cache] fatal", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
