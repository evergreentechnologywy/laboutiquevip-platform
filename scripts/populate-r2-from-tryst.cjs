#!/usr/bin/env node
/**
 * Tryst photo refresh → R2. Mirrors populate-r2-from-eros.cjs pipeline.
 *
 * Usage (VPS):
 *   NODE_PATH=/srv/apps/trystlike/repo/node_modules node scripts/populate-r2-from-tryst.cjs
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
const missingOnly = process.argv.includes("--missing-only");
const skipFile = process.argv.find((a) => a.startsWith("--skip-file="))?.split("=")[1]
  || path.join("/var/log/laboutiquevip", "tryst-r2-skip.ids");
const persistSkips = !process.argv.includes("--no-persist-skips");

const PUBLIC_BASE = process.env.S3_PUBLIC_BASE_URL || "https://www.laboutiquevip.net/api/r2-photo";
const KEY_PREFIX = process.env.S3_KEY_PREFIX || "laboutiquevip/providers";

const EXT_BY_TYPE = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};

const TRST_HOST_RE = /(?:tryst\.link|discovery\.tryst|a4cdn\.(?:ch|org)|media-v\d*\.tryst\.)/i;
const TRST_PROFILE_RE = /^https?:\/\/tryst\.link\/escort\/[^\s"'<>]+/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTrystProfileUrl(url) {
  return TRST_PROFILE_RE.test(String(url || ""));
}

function resolveTrystUrl(provider) {
  const candidates = [provider.verification_url, provider.review_url].filter(Boolean);
  for (const raw of candidates) {
    const u = String(raw).trim();
    if (isTrystProfileUrl(u)) return u;
    const hit = u.match(/https?:\/\/tryst\.link\/escort\/[^\s"'<>]+/i);
    if (hit) return hit[0];
  }
  return null;
}

function toMirrorUrl(url) {
  return `${JINA_PREFIX}${url.replace(/^https?:\/\//i, "")}`;
}

async function fetchTrystMarkdown(trystUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(toMirrorUrl(trystUrl), {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; lbv-tryst-r2/1.0)" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    // r.jina.ai proxies upstream errors as 200; Tryst 404 pages still embed
    // OTHER profiles' thumbnails — harvesting those attaches wrong photos.
    if (
      /^Title: Page not found/m.test(text) ||
      /couldn't be found/i.test(text) ||
      /^Warning: Target URL returned error \d+/m.test(text)
    ) {
      return null;
    }
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractTrystPhotos(markdown, existingPhotos = []) {
  // Primary: direct CDN URLs from Jina-rendered markdown
  const fromMarkdown = [
    ...String(markdown || "").matchAll(/https?:\/\/[^\s)]+(?:a4cdn\.(?:ch|org)|tryst\.link\/media|cdn\.tryst|images\.tryst)[^\s)]+/gi),
    // Broader: any image URLs that appear near the profile content
    ...String(markdown || "").matchAll(/https?:\/\/[^\s)"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^\s)"']*)?/gi),
    // Tryst discovery CDN
    ...String(markdown || "").matchAll(/https?:\/\/(?:discovery\.)?tryst[^\s)"']+\/[^\s)"']+\.(?:jpg|jpeg|png|webp)/gi),
  ].map((m) => m[0]);

  // Fallback: existing photos already in DB (don't lose what we have)
  const fromExisting = (Array.isArray(existingPhotos) ? existingPhotos : []).filter((u) => TRST_HOST_RE.test(String(u)) || String(u).includes("/api/r2-photo/"));

  const urls = [...new Set([...fromMarkdown, ...fromExisting])];
  return urls.slice(0, MAX_PHOTOS);
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
    if (!TRST_HOST_RE.test(sourceUrl) && !/^https?:\/\//i.test(sourceUrl)) continue;
    let imageResponse = null;
    // Try large→medium→small so dead /small.* or bare UUID URLs still upload.
    for (const candidate of expandTrystUploadCandidates(sourceUrl)) {
      try {
        const res = await fetch(candidate, {
          headers: { referer: "https://tryst.link/", "user-agent": "Mozilla/5.0 (compatible; lbv-tryst-r2/1.0)" },
        });
        if (res.ok) { imageResponse = res; break; }
      } catch {
        // try next size
      }
    }
    if (!imageResponse) continue;
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


function expandTrystUploadCandidates(url) {
  const value = String(url || "").trim();
  if (!value) return [];
  const match = value.match(/\/(small|medium|large)\.(avif|jpe?g|webp|png)$/i);
  if (!match) {
    // Bare UUID asset: try common size/ext derivatives when present on CDN.
    const bare = value.match(/^(https?:\/\/.+\/photos\/[0-9a-f-]{16,})(?:\.(avif|jpe?g|webp|png))?$/i);
    if (!bare) return [value];
    const root = bare[1];
    const out = [value];
    for (const size of ["large", "medium", "small"]) {
      for (const ext of ["avif", "jpeg", "jpg", "webp"]) {
        out.push(`${root}/${size}.${ext}`);
      }
    }
    return [...new Set(out)];
  }
  const ext = match[2].toLowerCase();
  const base = value.slice(0, match.index);
  const alts = ext === "avif" ? ["avif", "jpeg", "jpg"] : ext.startsWith("jp") ? ["jpeg", "jpg", "avif"] : [ext, "avif", "jpeg"];
  const out = [];
  for (const size of ["large", "medium", "small"]) {
    for (const e of alts) out.push(`${base}/${size}.${e}`);
  }
  return [...new Set(out)];
}

function loadSkipIds(filePath) {
  try {
    if (!fs.existsSync(filePath)) return new Set();
    return new Set(
      fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

function persistSkipId(filePath, id) {
  if (!persistSkips || !id) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${id}\n`);
  } catch (err) {
    console.warn(`WARN could not persist skip ${id}: ${err.message}`);
  }
}

function needsTrystPhotoRefresh(photos) {
  const list = Array.isArray(photos) ? photos : [];
  if (list.length === 0) return true;
  return !list.some((p) => String(p).includes("/api/r2-photo/"));
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
              { verification_provider: "tryst" },
              { verification_url: { contains: "tryst.link", mode: "insensitive" } },
              { review_url: { contains: "tryst.link", mode: "insensitive" } },
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

  const hasNoPhotos = (p) => !Array.isArray(p.photos) || p.photos.length === 0;
  const hasExistingTrystCdn = (p) =>
    (Array.isArray(p.photos) ? p.photos : []).some((u) => TRST_HOST_RE.test(String(u)));
  const skipIds = loadSkipIds(skipFile);
  // Prefer providers that already have Tryst CDN hotlinks (high success upload),
  // then empty galleries that need a live scrape. --missing-only restricts to empty.
  const targets = (missingOnly ? providers.filter(hasNoPhotos) : providers.filter((p) => needsTrystPhotoRefresh(p.photos)))
    .filter((p) => !skipIds.has(p.id))
    .sort((a, b) => Number(hasExistingTrystCdn(b)) - Number(hasExistingTrystCdn(a)) || Number(hasNoPhotos(b)) - Number(hasNoPhotos(a)));
  const slice = limit > 0 ? targets.slice(offset, offset + limit) : targets.slice(offset);
  console.log(
    `tryst_r2_targets=${providers.length} needs_refresh=${targets.length} skipped_ids=${skipIds.size} no_photos=${providers.filter(hasNoPhotos).length} processing=${slice.length} dryRun=${dryRun} missingOnly=${missingOnly}`,
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const provider of slice) {
    await sleep(delayMs);
    const trystUrl = resolveTrystUrl(provider);
    // Prefer live scrape, but always fall back to existing Tryst CDN / R2 URLs in DB.
    // Many profiles 404 on Tryst yet still have working a4cdn hotlinks we can mirror.
    let markdown = null;
    if (trystUrl) {
      markdown = await fetchTrystMarkdown(trystUrl);
    } else if (!Array.isArray(provider.photos) || provider.photos.length === 0) {
      skipped += 1;
      console.log(`SKIP no-tryst-url ${provider.display_name}`);
      continue;
    } else {
      console.log(`WARN no-tryst-url using-existing ${provider.display_name}`);
    }

    const selected = extractTrystPhotos(markdown, provider.photos);
    if (selected.length === 0) {
      failed += 1;
      persistSkipId(skipFile, provider.id);
      skipIds.add(provider.id);
      console.log(`FAIL no-tryst-photos ${provider.display_name}`);
      continue;
    }

    const storedUrls = await uploadPhotos(s3, bucket, provider.id, selected);
    if (storedUrls.length === 0) {
      failed += 1;
      persistSkipId(skipFile, provider.id);
      skipIds.add(provider.id);
      console.log(`FAIL no-upload ${provider.display_name}`);
      continue;
    }

    if (!dryRun) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Provider" SET photos = $1::jsonb, verification_provider = 'tryst',
         verification_url = COALESCE(CASE WHEN verification_url ILIKE '%tryst.link%' THEN verification_url ELSE NULL END, $2),
         updated_date = NOW() WHERE id = $3::uuid`,
        JSON.stringify(storedUrls),
        trystUrl,
        provider.id,
      );
    }
    updated += 1;
    console.log(`${dryRun ? "[dry-run] " : ""}OK ${provider.display_name}: ${storedUrls.length} tryst→R2`);
  }

  console.log(`done updated=${updated} skipped=${skipped} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
