#!/usr/bin/env node
/**
 * Recover empty Provider.photos for Eros listings.
 * 1) Scrape Eros via Jina (https+http retries, 60s timeout, backoff, Accept: text/plain)
 * 2) ALWAYS write i.eros.com CDN URLs to DB (frontend proxies via /api/eros-photo)
 * 3) Best-effort mirror to R2; upgrade DB paths when upload succeeds
 *
 * Resume-safe: processes empty / non-R2 photos ordered by updated_date.
 * Checkpoint: /tmp/lbv-recover-photos.progress.json
 *
 * Usage (VPS):
 *   set -a; . ./.env; set +a
 *   NODE_PATH=... node scripts/recover-photos-eros.cjs --workers=8 --limit=0
 * Flags: --jina-timeout-ms=60000 --jina-attempts=4 --jina-backoff-ms=900
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("../backend/generated/prisma-client");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const REPO_DIR = path.resolve(__dirname, "..");
const PROGRESS = process.env.RECOVER_PROGRESS || "/tmp/lbv-recover-photos.progress.json";

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!(key in process.env)) {
      process.env[key] = rest.join("=").replace(/^["']|["']$/g, "").trim();
    }
  }
}
loadEnv(path.join(REPO_DIR, ".env"));

const MAX_PHOTOS = Number(argVal("--max-photos", 32));
const DELAY_MS = Number(argVal("--delay-ms", 250));
const LIMIT = Number(argVal("--limit", 0));
const OFFSET = Number(argVal("--offset", 0));
const WORKERS = Math.max(1, Math.min(20, Number(argVal("--workers", 6))));
const JINA_TIMEOUT_MS = Number(argVal("--jina-timeout-ms", process.env.JINA_TIMEOUT_MS || 60000));
const JINA_ATTEMPTS = Math.max(1, Number(argVal("--jina-attempts", process.env.JINA_ATTEMPTS || 4)));
const JINA_BACKOFF_MS = Number(argVal("--jina-backoff-ms", process.env.JINA_BACKOFF_MS || 900));
const DRY = process.argv.includes("--dry-run");
const CDN_ONLY = process.argv.includes("--cdn-only");
const PUBLIC_BASE = process.env.S3_PUBLIC_BASE_URL || "https://www.laboutiquevip.net/api/r2-photo";
const KEY_PREFIX = process.env.S3_KEY_PREFIX || "laboutiquevip/providers";

function argVal(flag, fallback) {
  const hit = process.argv.find((a) => a.startsWith(flag + "="));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isErosProfileUrl(url) {
  return /^https?:\/\/(?:www|trans|massage)\.eros\.com\/[^\s]+\/files\/\d+\.htm/i.test(String(url || ""));
}

function resolveErosUrl(provider) {
  for (const raw of [provider.verification_url, provider.review_url].filter(Boolean)) {
    const u = String(raw).trim();
    if (isErosProfileUrl(u)) return u.split("#")[0];
    const m = u.match(/https?:\/\/(?:www|trans|massage)\.eros\.com\/[^\s"'<>]+\/files\/\d+\.htm[^"'<>]*/i);
    if (m) return m[0].split("#")[0];
  }
  return null;
}

function mirrorUrls(erosUrl) {
  const bare = erosUrl.replace(/^https?:\/\//i, "").replace(/\?.*$/, "");
  const withQuery = erosUrl.replace(/^https?:\/\//i, "");
  // Prefer https then http; bare first, then original query if present
  const urls = [
    `https://r.jina.ai/https://${bare}`,
    `https://r.jina.ai/http://${bare}`,
  ];
  if (withQuery !== bare) {
    urls.push(`https://r.jina.ai/https://${withQuery}`, `https://r.jina.ai/http://${withQuery}`);
  }
  return urls;
}

function isHomepageShell(text) {
  if (!text || text.length < 800) return true;
  // Generic Eros homepage / city hub shells without profile photo CDN or profile body
  const hasPhotos = /i\.eros\.com\//i.test(text);
  const hasProfileMarker =
    /\/profile\//i.test(text) ||
    /files\/\d+\.htm/i.test(text) ||
    /(?:Phone|Call|Text|Email|About Me|My Rates|Services)\b/i.test(text);
  if (
    /Female Escorts & Companions in the US, UK and Canada/i.test(text) &&
    !hasPhotos &&
    !hasProfileMarker
  ) {
    return true;
  }
  if (
    /Escort Directory|Browse by City|Find Escorts Near You/i.test(text) &&
    !hasPhotos &&
    !hasProfileMarker
  ) {
    return true;
  }
  // Jina error / empty proxy shells
  if (/^Warning: Target URL returned error \d+/m.test(text)) return true;
  if (/\bSITEMAP_FETCH_ERROR\b/.test(text)) return true;
  if (/^Title:\s*$/m.test(text) && text.length < 1500 && !hasPhotos) return true;
  return false;
}

function looksLikeProfileMarkdown(text) {
  if (!text || isHomepageShell(text)) return false;
  return (
    /i\.eros\.com\//i.test(text) ||
    /\/profile\//i.test(text) ||
    /files\/\d+\.htm/i.test(text) ||
    /(?:Phone|Call|Text|Email|About Me|My Rates)\b/i.test(text)
  );
}

async function fetchOneJina(jinaUrl, attempt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JINA_TIMEOUT_MS);
  try {
    const res = await fetch(jinaUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; lbv-photo-recover/3.0)",
        Accept: "text/plain",
        "x-respond-with": "markdown",
      },
    });

    if (res.status === 429) {
      const raw = await res.text().catch(() => "");
      let waitMs = Math.max(JINA_BACKOFF_MS, 8000) * (attempt + 1);
      try {
        const parsed = JSON.parse(raw);
        const retrySec = Number(parsed?.retryAfter ?? 0);
        if (Number.isFinite(retrySec) && retrySec > 0) waitMs = retrySec * 1000 + 500;
      } catch {
        /* keep default */
      }
      await sleep(waitMs);
      return { ok: false, retry: true, text: null };
    }

    if (!res.ok) {
      await sleep(JINA_BACKOFF_MS * (attempt + 1));
      return { ok: false, retry: res.status >= 500, text: null };
    }

    const text = await res.text();
    if (isHomepageShell(text)) {
      // try next mirror / attempt; shell often means soft-block or wrong scheme
      await sleep(JINA_BACKOFF_MS * (attempt + 1));
      return { ok: false, retry: true, text: null, shell: true };
    }
    if (looksLikeProfileMarkdown(text)) {
      return { ok: true, retry: false, text };
    }
    // non-shell but no profile markers — still retry other variants
    await sleep(Math.floor(JINA_BACKOFF_MS * 0.5) * (attempt + 1));
    return { ok: false, retry: true, text: null };
  } catch {
    await sleep(JINA_BACKOFF_MS * (attempt + 1));
    return { ok: false, retry: true, text: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithProxy(erosUrl) {
  const proxyUrl = process.env.BRD_PROXY_URL;
  if (!proxyUrl) return null;
  try {
    // Use native fetch with proxy via undici dispatcher or http agent
    const { ProxyAgent } = require("undici");
    const agent = new ProxyAgent(proxyUrl);
    const res = await fetch(erosUrl, {
      dispatcher: agent,
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (isHomepageShell(text)) return null;
    if (/i\.eros\.com\//i.test(text)) return text;
    return null;
  } catch {
    return null;
  }
}

async function fetchMarkdown(erosUrl) {
  const urls = mirrorUrls(erosUrl);
  // Round-robin: attempt 0..N-1 across all https/http variants
  for (let attempt = 0; attempt < JINA_ATTEMPTS; attempt++) {
    for (const jina of urls) {
      const result = await fetchOneJina(jina, attempt);
      if (result.ok && result.text) return result.text;
      // on non-retryable client error, still try other URL variants this attempt
    }
  }
  return null;
}

function extractErosPhotos(markdown) {
  const patterns = [
    /https?:\/\/(?:i|[a-z0-9-]+)\.eros\.com\/(?:i|profile)\/[^\s)"'<>]+/gi,
    /https?:\/\/i\.eros\.com\/[^\s)"'<>]+/gi,
  ];
  const found = new Set();
  for (const re of patterns) {
    for (const m of String(markdown || "").matchAll(re)) {
      let u = m[0].replace(/[),.;]+$/, "");
      if (/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(u) || /\/i\/|\/profile\//i.test(u)) {
        found.add(u);
      }
    }
  }
  // newest first
  return [...found].reverse().slice(0, MAX_PHOTOS);
}

function getS3() {
  const accessKeyId = (process.env.S3_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.S3_SECRET_ACCESS_KEY || "").trim();
  const endpoint = (process.env.S3_ENDPOINT || "").trim();
  if (!accessKeyId || !secretAccessKey || !endpoint) return null;
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION || "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

async function uploadOne(s3, bucket, providerId, sourceUrl, index) {
  const imageResponse = await fetch(sourceUrl, {
    headers: {
      referer: "https://www.eros.com/",
      "user-agent": "Mozilla/5.0 (compatible; lbv-photo-recover/2.0)",
    },
  });
  if (!imageResponse.ok) return null;
  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  if (!String(contentType).toLowerCase().startsWith("image/")) return null;
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  if (buffer.length < 2000) return null;
  const ext = /png/i.test(contentType) ? "png" : /webp/i.test(contentType) ? "webp" : "jpg";
  const filename = `${String(index).padStart(3, "0")}.${ext}`;
  const key = `${KEY_PREFIX}/${providerId}/${filename}`;
  const publicUrl = `${PUBLIC_BASE}/${providerId}/${filename}`;
  if (!DRY) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType.split(";")[0],
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  return publicUrl;
}

async function mirrorToR2(s3, bucket, providerId, sourceUrls) {
  if (!s3 || !bucket || CDN_ONLY) return [];
  const out = [];
  let i = 0;
  for (const src of sourceUrls) {
    try {
      const url = await uploadOne(s3, bucket, providerId, src, i);
      if (url) {
        out.push(url);
        i += 1;
      }
    } catch {
      // keep going; CDN URLs already saved
    }
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

function hasUsablePhotos(photos) {
  const list = Array.isArray(photos) ? photos : [];
  return list.some((u) => {
    const s = String(u || "");
    return s.includes("/api/r2-photo/") || /i\.eros\.com\//i.test(s) || /eros\.com\/(?:i|profile)\//i.test(s);
  });
}

function writeProgress(state) {
  try {
    fs.writeFileSync(PROGRESS, JSON.stringify({ ...state, at: new Date().toISOString() }, null, 2));
  } catch {
    /* ignore */
  }
}

async function processOne(prisma, s3, bucket, provider, stats) {
  const erosUrl = resolveErosUrl(provider);
  if (!erosUrl) {
    stats.skipped += 1;
    return;
  }
  await sleep(DELAY_MS + Math.floor(Math.random() * 120));
  let md = await fetchMarkdown(erosUrl);
  // Bright Data ISP proxy fallback when Jina fails
  if (!md && process.env.BRD_PROXY_URL) {
    const proxyMd = await fetchWithProxy(erosUrl);
    if (proxyMd) md = proxyMd;
  }
  if (!md) {
    stats.failFetch += 1;
    console.log(`FAIL fetch ${provider.display_name}`);
    return;
  }
  const selected = extractErosPhotos(md);
  if (!selected.length) {
    stats.failPhotos += 1;
    console.log(`FAIL no-photos ${provider.display_name}`);
    return;
  }

  let finalUrls = selected;
  const r2Urls = await mirrorToR2(s3, bucket, provider.id, selected);
  if (r2Urls.length) {
    finalUrls = r2Urls;
    stats.r2 += 1;
  } else {
    stats.cdn += 1;
  }

  if (!DRY) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Provider" SET photos = $1::jsonb, updated_date = NOW() WHERE id = $2::uuid`,
      JSON.stringify(finalUrls),
      provider.id,
    );
  }
  stats.updated += 1;
  console.log(
    `${DRY ? "[dry] " : ""}OK ${provider.display_name}: ${finalUrls.length} ${r2Urls.length ? "r2" : "cdn"}`,
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const s3 = getS3();
  const bucket = (process.env.S3_BUCKET || "laboutiquevip-images").trim();
  console.log(
    `recover start workers=${WORKERS} dry=${DRY} cdnOnly=${CDN_ONLY} s3=${Boolean(s3)} bucket=${bucket} secretLen=${(process.env.S3_SECRET_ACCESS_KEY || "").length} jinaTimeout=${JINA_TIMEOUT_MS} jinaAttempts=${JINA_ATTEMPTS} jinaBackoff=${JINA_BACKOFF_MS}`,
  );

  // quick R2 probe
  if (s3 && !CDN_ONLY && !DRY) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${KEY_PREFIX}/_health/probe.txt`,
          Body: Buffer.from(`ok ${Date.now()}`),
          ContentType: "text/plain",
        }),
      );
      console.log("R2 probe OK");
    } catch (e) {
      console.log("R2 probe FAIL — CDN-only mode:", String(e.message || e).slice(0, 160));
    }
  }

  const providers = await prisma.provider.findMany({
    where: {
      status: "active",
      OR: [
        { verification_provider: "eros" },
        { verification_url: { contains: "eros.com", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      display_name: true,
      verification_url: true,
      review_url: true,
      photos: true,
      updated_date: true,
    },
    orderBy: { updated_date: "asc" },
  });

  const need = providers.filter((p) => !hasUsablePhotos(p.photos));
  const slice = (LIMIT > 0 ? need.slice(OFFSET, OFFSET + LIMIT) : need.slice(OFFSET));
  console.log(`eros_active=${providers.length} need_photos=${need.length} processing=${slice.length}`);

  const stats = { updated: 0, skipped: 0, failFetch: 0, failPhotos: 0, r2: 0, cdn: 0, done: 0 };
  let cursor = 0;

  async function worker(wid) {
    while (true) {
      const i = cursor++;
      if (i >= slice.length) break;
      const p = slice[i];
      try {
        await processOne(prisma, s3, bucket, p, stats);
      } catch (e) {
        stats.failFetch += 1;
        console.log(`ERR ${p.display_name}: ${String(e.message || e).slice(0, 120)}`);
      }
      stats.done += 1;
      if (stats.done % 25 === 0) {
        writeProgress({ ...stats, total: slice.length, index: stats.done });
        console.log(
          `progress ${stats.done}/${slice.length} updated=${stats.updated} cdn=${stats.cdn} r2=${stats.r2} failFetch=${stats.failFetch}`,
        );
      }
    }
    void wid;
  }

  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
  writeProgress({ ...stats, total: slice.length, index: stats.done, finished: true });
  console.log("done", stats);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
