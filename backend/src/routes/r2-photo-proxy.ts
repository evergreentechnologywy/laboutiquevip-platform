import type { ApiRequest, ApiResponse } from "../types.js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

let s3: S3Client | null = null;

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

export async function r2PhotoProxyHandler(request: ApiRequest): Promise<ApiResponse> {
  // URL layout (two flavours both supported for backwards compatibility):
  //   /api/r2-photo/<uuid>/<filename>                  ← legacy: keyed by provider UUID
  //   /api/r2-photo/laboutiquevip/providers/<obj.png>  ← new uploads: full key passed through
  const pathParts = request.pathname.split("/").filter(Boolean);
  if (pathParts.length < 4) return { statusCode: 400, body: { error: "bad_request" } };

  const afterPrefix = pathParts.slice(2); // strip "api" "r2-photo"
  const looksLikeLegacy = afterPrefix.length === 2
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(afterPrefix[0]);

  const key = looksLikeLegacy
    ? `laboutiquevip/providers/${afterPrefix[0]}/${afterPrefix[1]}`
    : afterPrefix.join("/");

  try {
    const client = getS3Client();
    const bucket = process.env.S3_BUCKET || "openclaw";
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await client.send(cmd);

    if (!response.Body) return { statusCode: 404, body: { error: "not_found" } };

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) {
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
  } catch (e: any) {
    console.error("R2 proxy error:", e?.name || e);
    if (e?.name === "NoSuchKey") return { statusCode: 404, body: { error: "not_found" } };
    return { statusCode: 500, body: { error: "r2_error" } };
  }
}
