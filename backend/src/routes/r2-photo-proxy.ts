import type { ApiRequest, ApiResponse } from "../types.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

let s3: S3Client | null = null;

const ALLOWED_KEY_PREFIX = "laboutiquevip/providers/";
const LEGACY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+$/;

function getS3Client(): S3Client {
  if (s3) return s3;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("S3/R2 storage not configured");
  }
  s3 = new S3Client({
    endpoint,
    region: process.env.S3_REGION || "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return s3;
}

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
};

/** Exported for unit tests. */
export function resolveR2PhotoKey(pathname: string): { key: string; legacy: boolean } | null {
  const pathParts = pathname.split("/").filter(Boolean);
  if (pathParts.length < 4 || pathParts[0] !== "api" || pathParts[1] !== "r2-photo") {
    return null;
  }

  const afterPrefix = pathParts.slice(2);
  const looksLikeLegacy = afterPrefix.length === 2 && LEGACY_UUID_RE.test(afterPrefix[0] ?? "");

  if (looksLikeLegacy) {
    const providerId = afterPrefix[0] ?? "";
    const filename = afterPrefix[1] ?? "";
    if (!SAFE_FILENAME_RE.test(filename)) return null;
    return {
      key: `${ALLOWED_KEY_PREFIX}${providerId}/${filename}`,
      legacy: true,
    };
  }

  const key = afterPrefix.join("/");
  return { key, legacy: false };
}

/** Exported for unit tests. */
export function isAllowedR2ObjectKey(key: string, legacy: boolean): boolean {
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\")) {
    return false;
  }

  if (legacy) {
    const suffix = key.slice(ALLOWED_KEY_PREFIX.length);
    const slash = suffix.indexOf("/");
    if (slash <= 0) return false;
    const providerId = suffix.slice(0, slash);
    const filename = suffix.slice(slash + 1);
    if (!LEGACY_UUID_RE.test(providerId) || !filename || filename.includes("/")) return false;
    return SAFE_FILENAME_RE.test(filename);
  }

  if (!key.startsWith(ALLOWED_KEY_PREFIX)) return false;
  const remainder = key.slice(ALLOWED_KEY_PREFIX.length);
  if (!remainder || remainder.includes("..")) return false;

  if (LEGACY_UUID_RE.test(remainder.split("/")[0] ?? "")) {
    const parts = remainder.split("/");
    if (parts.length !== 2) return false;
    return SAFE_FILENAME_RE.test(parts[1] ?? "");
  }

  return SAFE_FILENAME_RE.test(remainder);
}

export async function r2PhotoProxyHandler(request: ApiRequest): Promise<ApiResponse> {
  const resolved = resolveR2PhotoKey(request.pathname);
  if (!resolved || !isAllowedR2ObjectKey(resolved.key, resolved.legacy)) {
    return { statusCode: 400, body: { error: "bad_request" } };
  }

  const key = resolved.key;

  try {
    const client = getS3Client();
    const bucket = process.env.S3_BUCKET || "openclaw";
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await client.send(cmd);

    if (!response.Body) return { statusCode: 404, body: { error: "not_found" } };

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const ext = "." + (key.split(".").pop() || "jpg").toLowerCase();
    const contentType = response.ContentType || MIME_TYPES[ext] || "image/jpeg";

    return {
      statusCode: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=31536000, immutable",
        "content-length": String(buffer.length),
      },
      rawBuffer: buffer,
    };
  } catch (e: unknown) {
    const err = e as { name?: string };
    console.error("R2 proxy error:", err?.name || e);
    if (err?.name === "NoSuchKey") return { statusCode: 404, body: { error: "not_found" } };
    return { statusCode: 500, body: { error: "r2_error" } };
  }
}
