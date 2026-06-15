import type { ApiRequest } from "../types.js";
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

export async function r2PhotoProxyHandler(request: ApiRequest): Promise<{ statusCode: number; headers?: Record<string, string>; body?: string | Buffer; isBase64Encoded?: boolean }> {
  // URL: /api/r2-photo/:providerId/:filename
  const pathParts = request.pathname.split("/").filter(Boolean);
  if (pathParts.length < 4) return { statusCode: 400, body: "Bad request" };
  
  const providerId = pathParts[2];
  const filename = pathParts.slice(3).join("/");
  const key = `laboutiquevip/providers/${providerId}/${filename}`;
  console.log("r2PhotoProxyHandler CALLED for key:", key);
  
  try {
    const client = getS3Client();
    const bucket = process.env.S3_BUCKET || "openclaw";
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await client.send(cmd);
    
    if (!response.Body) {
      console.log("R2 response body is empty for key:", key);
      return { statusCode: 404 };
    }
    
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    
    const ext = "." + (filename.split(".").pop() || "jpg");
    const contentType = response.ContentType || MIME_TYPES[ext] || "image/jpeg";
    
    return {
      statusCode: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=31536000, immutable",
        "content-length": String(body.length),
      },
      body: body.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e: any) {
    console.error("R2 proxy execution failed with error:", e);
    if (e.name === "NoSuchKey") return { statusCode: 404 };
    return { statusCode: 500, body: "R2 error" };
  }
}
