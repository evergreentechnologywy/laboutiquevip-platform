/**
 * Mirror provider gallery URLs (Eros / Tryst CDN) to R2 public paths.
 */

import fs from "node:fs";
import path from "node:path";
import pkgS3 from "@aws-sdk/client-s3";
import sharp from "sharp";

const { S3Client, PutObjectCommand } = pkgS3;

const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const EROS_HOST_RE = /^https?:\/\/(?:i|[a-z0-9-]+)\.eros\.com\//i;
const TRST_HOST_RE = /(?:tryst\.link|discovery\.tryst|a4cdn\.(?:ch|org))/i;

export function loadRepoEnv(repoDir = process.cwd()) {
  const envPath = path.join(repoDir, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!(key in process.env)) process.env[key] = rest.join("=").replace(/^"|"$/g, "");
  }
}

export function getPublicBase() {
  return process.env.S3_PUBLIC_BASE_URL || "https://www.laboutiquevip.net/api/r2-photo";
}

export function getKeyPrefix() {
  return process.env.S3_KEY_PREFIX || "laboutiquevip/providers";
}

export function isR2PhotoUrl(url) {
  return String(url ?? "").includes("/api/r2-photo/");
}

export function photosNeedR2Mirror(photos) {
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  if (list.length === 0) return true;
  return list.some((url) => !isR2PhotoUrl(url));
}

export function getS3Client() {
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

function refererForUrl(sourceUrl) {
  if (EROS_HOST_RE.test(sourceUrl)) return "https://www.eros.com/";
  if (TRST_HOST_RE.test(sourceUrl)) return "https://tryst.link/";
  return undefined;
}

function allowedSourceUrl(sourceUrl) {
  const u = String(sourceUrl ?? "");
  return EROS_HOST_RE.test(u) || TRST_HOST_RE.test(u) || /^https?:\/\//i.test(u);
}

/**
 * Upload source gallery URLs to R2. Returns public /api/r2-photo paths (newest-first preserved).
 */
export async function uploadSourcePhotosToR2({
  s3,
  bucket,
  providerId,
  sourceUrls,
  maxPhotos = 32,
  dryRun = false,
}) {
  const stored = [];
  const blurPlaceholders = [];
  let index = 0;
  const urls = Array.isArray(sourceUrls) ? sourceUrls.filter(allowedSourceUrl) : [];

  // Image size variants to generate (width, suffix)
  const VARIANTS = [
    [150, "thumb"],
    [400, "sm"],
    [800, "md"],
    [1200, "lg"],
  ];

  for (const sourceUrl of urls) {
    let imageResponse;
    try {
      imageResponse = await fetch(sourceUrl, {
        headers: {
          referer: refererForUrl(sourceUrl),
          "user-agent": "Mozilla/5.0 (compatible; lbv-r2-upload/1.0)",
        },
      });
    } catch {
      continue;
    }
    if (!imageResponse.ok) continue;
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    if (!String(contentType).toLowerCase().startsWith("image/")) continue;
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (buffer.length < 2000) continue;

    // Generate blur placeholder (10px thumbnail as base64 data URL)
    let blurDataURL = null;
    try {
      const blurBuf = await sharp(buffer).resize(10).jpeg({ quality: 20 }).toBuffer();
      blurDataURL = `data:image/jpeg;base64,${blurBuf.toString("base64")}`;
    } catch { /* skip blur if sharp fails */ }

    // Upload full-size WebP as primary
    const ext = "webp";
    const baseFilename = String(index).padStart(3, "0");
    const prefix = getKeyPrefix();
    const baseUrl = getPublicBase();

    let primaryUrl = null;

    for (const [width, suffix] of VARIANTS) {
      let variantBuffer;
      try {
        variantBuffer = await sharp(buffer)
          .resize(width, undefined, { fit: "cover", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        continue;
      }

      const filename = `${baseFilename}-${suffix}.${ext}`;
      const key = `${prefix}/${providerId}/${filename}`;
      const publicUrl = `${baseUrl}/${providerId}/${filename}`;

      if (!dryRun) {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: variantBuffer,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
      }

      // Use the medium size (800w) as the primary display URL
      if (width === 800) primaryUrl = publicUrl;
      if (width === 1200 && !primaryUrl) primaryUrl = publicUrl;
    }

    if (primaryUrl) {
      stored.push(primaryUrl);
      if (blurDataURL) blurPlaceholders.push(blurDataURL);
    }

    index += 1;
    if (stored.length >= maxPhotos) break;
  }

  return { photoUrls: stored, blurPlaceholders };
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
  };
  return map[ext] || "image/jpeg";
}

function extFromMime(contentType) {
  return EXT_BY_TYPE[String(contentType).split(";")[0].toLowerCase()] || "jpg";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mirror remote URLs or local file paths to R2. Skips URLs already on /api/r2-photo/.
 */
export async function mirrorProviderPhotosToR2(providerId, sources, { max = 32, delayMs = 100, dryRun = false } = {}) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is required");
  const s3 = getS3Client();
  const stored = [];
  const seen = new Set();

  for (const raw of Array.isArray(sources) ? sources : []) {
    if (stored.length >= max) break;
    const source = String(raw ?? "").trim();
    if (!source || seen.has(source)) continue;
    seen.add(source);

    if (isR2PhotoUrl(source)) {
      stored.push(source);
      continue;
    }

    try {
      let buffer;
      let contentType;
      if (source.startsWith("/") && fs.existsSync(source)) {
        buffer = fs.readFileSync(source);
        contentType = mimeFromPath(source);
      } else if (source.startsWith("file://")) {
        const filePath = new URL(source).pathname;
        buffer = fs.readFileSync(filePath);
        contentType = mimeFromPath(filePath);
      } else if (/^https?:\/\//i.test(source)) {
        const imageResponse = await fetch(source, {
          headers: {
            referer: refererForUrl(source),
            "user-agent": "Mozilla/5.0 (compatible; lbv-evergreen-import/1.0)",
          },
        });
        if (!imageResponse.ok) continue;
        contentType = imageResponse.headers.get("content-type") || "image/jpeg";
        if (!String(contentType).toLowerCase().startsWith("image/")) continue;
        buffer = Buffer.from(await imageResponse.arrayBuffer());
      } else {
        continue;
      }

      if (!buffer || buffer.length < 2000) continue;
      const ext = extFromMime(contentType);
      const filename = `${String(stored.length).padStart(3, "0")}.${ext}`;
      const key = `${getKeyPrefix()}/${providerId}/${filename}`;
      const publicUrl = `${getPublicBase()}/${providerId}/${filename}`;

      if (!dryRun) {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
      }
      stored.push(publicUrl);
      if (delayMs > 0) await sleep(delayMs);
    } catch (err) {
      console.warn(`  photo skip ${source.slice(0, 80)}: ${err.message}`);
    }
  }

  return stored;
}
