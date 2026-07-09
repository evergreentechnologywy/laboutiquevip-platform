#!/usr/bin/env node
/**
 * Apply staged catalog scan cache to production DB (midnight merge window).
 */

import {
  readCacheRecords,
  resolveCacheDir,
  resolveLatestCacheDir,
} from "./lib/catalog-scan-cache.mjs";
import {
  catalogSeenTouchFields,
  findCatalogDuplicateInCity,
  shouldSkipCatalogInsert,
} from "./lib/catalog-sync-policy.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

const cacheDir = args.has("cache-dir")
  ? resolveCacheDir(args.get("cache-dir"))
  : resolveLatestCacheDir();

import { createPrismaClient } from "./lib/prisma-client.mjs";

const prisma = await createPrismaClient();

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
    const seenFields = catalogSeenTouchFields();
    const payloadWithSeen = { ...payload, ...seenFields };

    if (existingId) {
      const existing = await prisma.provider.findUnique({ where: { id: existingId } });
      await prisma.provider.update({
        where: { id: existingId },
        data: { ...payloadWithSeen, ...catalogSeenTouchFields(existing) },
      });
      stats.updated += 1;
      if (recordIsVerified(payload)) stats.verified += 1;
      return;
    }

    const duplicateInCity = await findCatalogDuplicateInCity(prisma, {
      verification_provider: payload.verification_provider,
      verification_url: payload.verification_url,
      display_name: payload.display_name,
      location_city: payload.location_city,
      location_state: payload.location_state,
    });
    if (duplicateInCity && shouldSkipCatalogInsert(payload, duplicateInCity)) {
      await prisma.provider.update({
        where: { id: duplicateInCity.id },
        data: { ...payloadWithSeen, ...catalogSeenTouchFields(duplicateInCity) },
      });
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
      await prisma.provider.update({
        where: { id: dup.id },
        data: { ...payloadWithSeen, ...catalogSeenTouchFields(dup) },
      });
      stats.updated += 1;
      if (recordIsVerified(payload)) stats.verified += 1;
      return;
    }

    await prisma.provider.create({
      data: {
        ...payloadWithSeen,
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
