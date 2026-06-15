import crypto from "node:crypto";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type VideoUploadResult = {
  fileUrl: string;
  storageKey: string;
};

function getR2Config() {
  const bucket = process.env.S3_BUCKET?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim();
  const keyPrefix = (process.env.S3_KEY_PREFIX ?? "videos").replace(/^\/+|\/+$/g, "");

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    throw new Error("R2 video storage not configured");
  }

  return { bucket, endpoint, accessKeyId, secretAccessKey, publicBaseUrl, keyPrefix };
}

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (r2Client) return r2Client;
  const config = getR2Config();

  let secretKey = config.secretAccessKey;
  if (secretKey.startsWith("cfat_")) {
    secretKey = crypto.createHash("sha256").update(secretKey).digest("hex");
  }

  r2Client = new S3Client({
    region: process.env.S3_REGION?.trim() || "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: secretKey,
    },
  });

  return r2Client;
}

function buildVideoKey(filename: string): string {
  const config = getR2Config();
  const safeBaseName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = path.extname(safeBaseName) || ".mp4";
  const safeName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  return config.keyPrefix ? `${config.keyPrefix}/${safeName}` : safeName;
}

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
]);

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export function isAllowedVideoType(contentType: string): boolean {
  return ALLOWED_VIDEO_TYPES.has(contentType);
}

export async function storeVideo(params: {
  filename: string;
  contentType: string;
  fileBuffer: Buffer;
}): Promise<VideoUploadResult> {
  const config = getR2Config();
  const client = getR2Client();
  const storageKey = buildVideoKey(params.filename);

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: storageKey,
    Body: params.fileBuffer,
    ContentType: params.contentType,
  }));

  const fileUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/${storageKey}`;
  return { storageKey, fileUrl };
}
