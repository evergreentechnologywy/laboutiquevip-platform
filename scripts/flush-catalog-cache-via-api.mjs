#!/usr/bin/env node
/**
 * Post staged catalog-scan-cache NDJSON to LBV catalog ingest API.
 * Replaces direct-DB merge for external worker / Aura path.
 *
 * Usage:
 *   CATALOG_API_BASE=http://127.0.0.1:8787 \
 *   CATALOG_SERVICE_JWT=<jwt> \
 *   node scripts/flush-catalog-cache-via-api.mjs [--cache-dir=...] [--source=eros|tryst|all] [--dry-run] [--batch=100]
 */
import fs from "node:fs";
import path from "node:path";
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

const sourceFilter = String(args.get("source") || "all").toLowerCase();
const dryRun = args.has("dry-run");
const batchSize = Math.min(100, Math.max(1, Number(args.get("batch") || 100)));
const base = (process.env.CATALOG_API_BASE || process.env.LBV_API_BASE || "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);
const token = process.env.CATALOG_SERVICE_JWT || process.env.LBV_SERVICE_JWT || "";

if (!token) {
  console.error("Set CATALOG_SERVICE_JWT (Bearer JWT with role=service)");
  process.exit(2);
}

const cacheDir = args.has("cache-dir")
  ? resolveCacheDir(args.get("cache-dir"))
  : resolveLatestCacheDir();

function toIngestItem(record) {
  const p = record?.payload && typeof record.payload === "object" ? record.payload : record || {};
  const verification_url =
    p.verification_url ||
    record?.sourceUrl ||
    p.sourceUrl ||
    null;
  const display_name = p.display_name || p.name || null;
  if (!verification_url || !display_name) return null;

  const photosRaw = Array.isArray(p.photos) ? p.photos : [];
  const photos = photosRaw
    .filter((u) => typeof u === "string" && /^https?:\/\//i.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, 32);

  return {
    display_name: String(display_name).slice(0, 160),
    verification_url: String(verification_url).slice(0, 1000),
    location_city: p.location_city ?? null,
    location_state: p.location_state ?? null,
    location_country: p.location_country ?? "US",
    bio: p.bio ?? p.ad_body ?? null,
    tagline: p.tagline ?? p.ad_headline ?? null,
    age: typeof p.age === "number" ? p.age : null,
    phone: p.phone ?? null,
    email: p.email && String(p.email).includes("@") ? p.email : null,
    photos: photos.length ? photos : null,
    ad_headline: p.ad_headline ?? null,
    ad_body: p.ad_body ?? null,
    review_url: p.review_url || p.p411_url || p.ter_url || null,
    is_verified: p.is_verified ?? true,
    is_profile_approved: p.is_profile_approved ?? true,
    status: p.status === "inactive" ? "inactive" : "active",
  };
}

async function postBatch(source, providers) {
  const res = await fetch(`${base}/api/v1/catalog/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      source,
      providers,
      dry_run: dryRun,
      reactivate: true,
    }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`ingest ${source} HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return body;
}

async function flushSource(source) {
  const records = readCacheRecords(cacheDir, source);
  const items = [];
  for (const rec of records) {
    const item = toIngestItem(rec);
    if (item) items.push(item);
  }
  const stats = { source, total: items.length, batches: 0, created: 0, updated: 0, skipped: 0 };
  console.log(`[flush-api] ${source} items=${items.length} cacheDir=${cacheDir}`);

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const body = await postBatch(source, chunk);
    stats.batches += 1;
    const c = body?.counts || {};
    stats.created += Number(c.created || 0);
    stats.updated += Number(c.updated || 0);
    stats.skipped += Number(c.skipped || 0);
    console.log(
      `[flush-api] ${source} batch ${stats.batches} size=${chunk.length} counts=${JSON.stringify(c)}`,
    );
  }
  return stats;
}

const sources =
  sourceFilter === "all"
    ? ["eros", "tryst"]
    : sourceFilter === "eros" || sourceFilter === "tryst"
      ? [sourceFilter]
      : null;

if (!sources) {
  console.error("--source must be eros|tryst|all");
  process.exit(2);
}

const all = [];
for (const s of sources) {
  all.push(await flushSource(s));
}
console.log("[flush-api] complete", JSON.stringify({ dryRun, base, cacheDir, results: all }, null, 2));
