#!/usr/bin/env node
/**
 * Upload gallery photos from the 8 PM staged scan cache to R2 immediately after midnight merge-cache.
 * Uses scraped Eros / Tryst CDN URLs from cache payloads (no re-scrape).
 */

import {
  readCacheRecords,
  resolveCacheDir,
  resolveLatestCacheDir,
} from "./lib/catalog-scan-cache.mjs";
import {
  getS3Client,
  loadRepoEnv,
  uploadSourcePhotosToR2,
} from "./lib/r2-photo-upload.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

loadRepoEnv(process.cwd());
const dryRun = args.has("dry-run");
const cacheDir = args.has("cache-dir")
  ? resolveCacheDir(args.get("cache-dir"))
  : resolveLatestCacheDir();

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const s3 = getS3Client();
const bucket = process.env.S3_BUCKET;

const stats = { processed: 0, updated: 0, skipped: 0, failed: 0 };

async function resolveProviderId(record) {
  if (record.existingId) return record.existingId;
  const url = record.payload?.verification_url;
  if (!url) return null;
  const row = await prisma.provider.findFirst({
    where: {
      OR: [{ verification_url: url }, { review_url: url }],
    },
    select: { id: true, photos: true },
  });
  return row?.id ?? null;
}

async function main() {
  console.log(`[staged-r2] start cacheDir=${cacheDir} dryRun=${dryRun}`);
  const records = [...readCacheRecords(cacheDir, "eros"), ...readCacheRecords(cacheDir, "tryst")];
  console.log(`[staged-r2] cache records=${records.length}`);

  for (const record of records) {
    stats.processed += 1;
    const photos = record.payload?.photos;
    if (!Array.isArray(photos) || photos.length === 0) {
      stats.skipped += 1;
      continue;
    }

    const providerId = await resolveProviderId(record);
    if (!providerId) {
      stats.skipped += 1;
      continue;
    }

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true, display_name: true, photos: true },
    });
    if (!provider) {
      stats.skipped += 1;
      continue;
    }

    const cachePhotos = (Array.isArray(photos) ? photos : []).filter(Boolean);
    const sourceUrls = cachePhotos.filter((u) => !String(u).includes("/api/r2-photo/"));
    if (sourceUrls.length === 0) {
      stats.skipped += 1;
      continue;
    }

    const storedUrls = await uploadSourcePhotosToR2({
      s3,
      bucket,
      providerId,
      sourceUrls,
      dryRun,
    });
    if (storedUrls.length === 0) {
      stats.failed += 1;
      console.log(`[staged-r2] FAIL no-upload ${provider.display_name}`);
      continue;
    }

    if (!dryRun) {
      await prisma.provider.update({
        where: { id: providerId },
        data: { photos: storedUrls, updated_date: new Date() },
      });
    }
    stats.updated += 1;
    console.log(`[staged-r2] OK ${provider.display_name}: ${storedUrls.length} photos`);
  }

  console.log("[staged-r2] complete", stats);
}

main()
  .catch((err) => {
    console.error("[staged-r2] fatal", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
