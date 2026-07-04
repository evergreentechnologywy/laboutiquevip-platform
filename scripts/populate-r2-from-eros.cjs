#!/usr/bin/env node
/**
 * Eros-only photo refresh → R2. Never uses ultragfe.com.
 *
 * Usage (VPS):
 *   NODE_PATH=/srv/apps/trystlike/repo/node_modules node scripts/populate-r2-from-eros.cjs
 *   ... --id=UUID  --limit=100  --offset=0  --dry-run
 */
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("../backend/generated/prisma-client");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const REPO_DIR = path.resolve(__dirname, "..");

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!(key in process.env)) process.env[key] = rest.join("=").replace(/^"|"$/g, "");
  }
}
loadEnv(path.join(REPO_DIR, ".env"));

const JINA_PREFIX = "https://r.jina.ai/http://";
const MAX_PHOTOS = Number(process.argv.find((a) => a.startsWith("--max-photos="))?.split("=")[1] ?? 32);
const delayMs = Number(process.argv.find((a) => a.startsWith("--delay-ms="))?.split("=")[1] ?? 400);
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);
const offset = Number(process.argv.find((a) => a.startsWith("--offset="))?.split("=")[1] ?? 0);
const onlyId = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1];
const idsFile = process.argv.find((a) => a.startsWith("--ids-file="))?.split("=")[1];
const dryRun = process.argv.includes("--dry-run");

const PUBLIC_BASE = process.env.S3_PUBLIC_BASE_URL || "https://www.laboutiquevip.net/api/r2-photo";
const KEY_PREFIX = process.env.S3_KEY_PREFIX || "laboutiquevip/providers";

const EXT_BY_TYPE = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isErosProfileUrl(url) {
  return /^https?:\/\/(?:www|trans|massage)\.eros\.com\/[^\s]+\/files\/\d+\.htm/i.test(String(url || ""));
}

function resolveErosUrl(provider) {
  const candidates = [provider.verification_url, provider.review_url].filter(Boolean);
  for (const raw of candidates) {
    const u = String(raw).trim();
    if (isErosProfileUrl(u)) return u;
    const erosHit = u.match(/https?:\/\/(?:www|trans|massage)\.eros\.com\/[^\s"'<>]+\/files\/\d+\.htm[^"'<>]*/i);
    if (erosHit) return erosHit[0];
  }
  return null;
}

function toMirrorUrl(url) {
  return `${JINA_PREFIX}${url.replace(/^https?:\/\//i, "")}`;
}

async function fetchErosMarkdown(erosUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(toMirrorUrl(erosUrl), {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; lbv-eros-r2/1.0)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractErosPhotos(markdown) {
  const urls = [...new Set(
    [...String(markdown || "").matchAll(/https?:\/\/(?:i|[a-z0-9-]+)\.eros\.com\/(?:i|profile)\/[^\s)]+/gi)].map((m) => m[0]),
  )];
  // Eros galleries are oldest-first; newest first for display
  return urls.reverse().slice(0, MAX_PHOTOS);
}

function getS3Client() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "auto",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
}

async function uploadPhotos(s3, bucket, providerId, sourceUrls) {
  const stored = [];
  let index = 0;
  for (const sourceUrl of sourceUrls) {
    if (!/^https?:\/\/(?:i|[a-z0-9-]+)\.eros\.com\//i.test(sourceUrl)) continue;
    let imageResponse;
    try {
      imageResponse = await fetch(sourceUrl, {
        headers: { referer: "https://www.eros.com/", "user-agent": "Mozilla/5.0 (compatible; lbv-eros-r2/1.0)" },
      });
    } catch {
      continue;
    }
    if (!imageResponse.ok) continue;
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    if (!String(contentType).toLowerCase().startsWith("image/")) continue;
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (buffer.length < 2000) continue;

    const ext = EXT_BY_TYPE[contentType.split(";")[0].toLowerCase()] || "jpg";
    const filename = String(index).padStart(3, "0") + "." + ext;
    const key = `${KEY_PREFIX}/${providerId}/${filename}`;
    const publicUrl = `${PUBLIC_BASE}/${providerId}/${filename}`;

    if (!dryRun) {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }));
    }
    stored.push(publicUrl);
    index += 1;
    if (stored.length >= MAX_PHOTOS) break;
  }
  return stored;
}

async function main() {
  const prisma = new PrismaClient();
  const s3 = getS3Client();
  const bucket = process.env.S3_BUCKET;

  const ids = idsFile
    ? fs.readFileSync(idsFile, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : null;

  const providers = await prisma.provider.findMany({
    where: onlyId
      ? { id: onlyId }
      : ids
        ? { id: { in: ids } }
        : {
            status: "active",
            OR: [
              { verification_provider: "eros" },
              { verification_url: { contains: "eros.com", mode: "insensitive" } },
              { review_url: { contains: "eros.com", mode: "insensitive" } },
            ],
          },
    select: {
      id: true,
      display_name: true,
      verification_url: true,
      review_url: true,
      verification_provider: true,
      photos: true,
    },
    orderBy: { updated_date: "asc" },
  });

  const slice = (limit > 0 ? providers.slice(offset, offset + limit) : providers.slice(offset));
  console.log(`eros_r2_targets=${providers.length} processing=${slice.length} dryRun=${dryRun}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const provider of slice) {
    await sleep(delayMs);
    const erosUrl = resolveErosUrl(provider);
    if (!erosUrl) {
      skipped += 1;
      console.log(`SKIP no-eros-url ${provider.display_name}`);
      continue;
    }

    const markdown = await fetchErosMarkdown(erosUrl);
    if (!markdown) {
      failed += 1;
      console.log(`FAIL fetch ${provider.display_name} ${erosUrl}`);
      continue;
    }

    const selected = extractErosPhotos(markdown);
    if (selected.length === 0) {
      failed += 1;
      console.log(`FAIL no-eros-photos ${provider.display_name}`);
      continue;
    }

    const storedUrls = await uploadPhotos(s3, bucket, provider.id, selected);
    if (storedUrls.length === 0) {
      failed += 1;
      console.log(`FAIL no-upload ${provider.display_name}`);
      continue;
    }

    if (!dryRun) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Provider" SET photos = $1::jsonb, verification_provider = 'eros',
         verification_url = COALESCE(CASE WHEN verification_url ILIKE '%eros.com%' THEN verification_url ELSE NULL END, $2),
         updated_date = NOW() WHERE id = $3::uuid`,
        JSON.stringify(storedUrls),
        erosUrl,
        provider.id,
      );
    }
    updated += 1;
    console.log(`${dryRun ? "[dry-run] " : ""}OK ${provider.display_name}: ${storedUrls.length} eros→R2`);
  }

  console.log(`done updated=${updated} skipped=${skipped} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
