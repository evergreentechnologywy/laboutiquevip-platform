import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const DEFAULT_UPLOAD_DIR = "/srv/apps/trystlike/repo/backend/uploads";
export const DEFAULT_PUBLIC_UPLOAD_BASE = "/uploads";

export type UploadResult = {
  fileUrl: string;
  storageKey: string;
};

type UploadStorageDriver = {
  kind: "local" | "s3";
  upload: (params: { filename: string; contentType: string; fileBuffer: Buffer }) => Promise<UploadResult>;
  servesLocalUploads: boolean;
};

type S3Config = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefix: string;
  publicBaseUrl?: string;
  forcePathStyle: boolean;
};

let uploadStorageOverride: UploadStorageDriver | null = null;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function buildSafeObjectKey(filename: string, prefix = ""): string {
  const safeBaseName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = path.extname(safeBaseName) || ".bin";
  const safeName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const normalizedPrefix = trimSlashes(prefix);
  return normalizedPrefix ? `${normalizedPrefix}/${safeName}` : safeName;
}

function getLocalUploadDir(): string {
  return process.env.UPLOAD_DIR ?? DEFAULT_UPLOAD_DIR;
}

function getPublicUploadBase(): string {
  return process.env.PUBLIC_UPLOAD_BASE ?? DEFAULT_PUBLIC_UPLOAD_BASE;
}

function getS3ConfigFromEnv(): S3Config | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    region: process.env.S3_REGION?.trim() || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    keyPrefix: trimSlashes(process.env.S3_KEY_PREFIX ?? "uploads"),
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL?.trim() || undefined,
    forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE, true),
  };
}

function buildS3PublicUrl(config: S3Config, storageKey: string): string {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/$/, "")}/${storageKey}`;
  }

  if (config.endpoint) {
    const endpoint = new URL(config.endpoint);
    const cleanPath = endpoint.pathname.replace(/\/$/, "");
    if (config.forcePathStyle) {
      endpoint.pathname = `${cleanPath}/${config.bucket}/${storageKey}`;
      return endpoint.toString();
    }

    endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
    endpoint.pathname = `${cleanPath}/${storageKey}`;
    return endpoint.toString();
  }

  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${storageKey}`;
}

function createLocalUploadStorage(): UploadStorageDriver {
  return {
    kind: "local",
    servesLocalUploads: true,
    async upload({ filename, fileBuffer }) {
      const uploadDir = path.resolve(getLocalUploadDir());
      await fs.mkdir(uploadDir, { recursive: true });

      const storageKey = buildSafeObjectKey(filename);
      const targetPath = path.resolve(uploadDir, storageKey);
      if (!targetPath.startsWith(`${uploadDir}${path.sep}`)) {
        throw new Error("invalid_filename");
      }

      await fs.writeFile(targetPath, fileBuffer);
      return {
        storageKey,
        fileUrl: `${getPublicUploadBase().replace(/\/$/, "")}/${storageKey}`,
      };
    },
  };
}

function createS3UploadStorage(config: S3Config): UploadStorageDriver {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    kind: "s3",
    servesLocalUploads: false,
    async upload({ filename, contentType, fileBuffer }) {
      const storageKey = buildSafeObjectKey(filename, config.keyPrefix);
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: storageKey,
        Body: fileBuffer,
        ContentType: contentType,
      }));

      return {
        storageKey,
        fileUrl: buildS3PublicUrl(config, storageKey),
      };
    },
  };
}

export function getUploadStorage(): UploadStorageDriver {
  if (uploadStorageOverride) return uploadStorageOverride;
  const s3Config = getS3ConfigFromEnv();
  return s3Config ? createS3UploadStorage(s3Config) : createLocalUploadStorage();
}

export function shouldServeLocalUploads(): boolean {
  return getUploadStorage().servesLocalUploads;
}

export function getLocalUploadPathFromRequestPath(requestPath: string): string | null {
  const publicBase = getPublicUploadBase().replace(/\/$/, "");
  if (!requestPath.startsWith(`${publicBase}/`)) return null;

  const relativePath = requestPath.slice(publicBase.length + 1);
  if (!relativePath) return null;

  const uploadDir = path.resolve(getLocalUploadDir());
  const fullPath = path.resolve(uploadDir, relativePath);
  if (!fullPath.startsWith(`${uploadDir}${path.sep}`)) return null;
  return fullPath;
}

export async function storeUpload(params: { filename: string; contentType: string; fileBuffer: Buffer }): Promise<UploadResult> {
  return getUploadStorage().upload(params);
}

export function setUploadStorageForTests(storage: UploadStorageDriver | null): void {
  uploadStorageOverride = storage;
}
