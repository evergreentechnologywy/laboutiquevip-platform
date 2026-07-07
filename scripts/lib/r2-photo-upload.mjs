/**
 * Mirror provider gallery URLs (Eros / Tryst CDN) to R2 public paths.
 */

import fs from "node:fs";
import path from "node:path";
import pkgS3 from "@aws-sdk/client-s3";

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
  let index = 0;
  const urls = Array.isArray(sourceUrls) ? sourceUrls.filter(allowedSourceUrl) : [];

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

    const ext = EXT_BY_TYPE[contentType.split(";")[0].toLowerCase()] || "jpg";
    const filename = `${String(index).padStart(3, "0")}.${ext}`;
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
    index += 1;
    if (stored.length >= maxPhotos) break;
  }

  return stored;
}
