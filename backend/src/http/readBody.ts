import type { IncomingMessage } from "node:http";

export const MAX_JSON_BODY_BYTES = 6 * 1024 * 1024;
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export class BodyTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super("body_too_large");
    this.name = "BodyTooLargeError";
    this.maxBytes = maxBytes;
  }
}

function resolveBodyLimit(pathname: string): number {
  if (pathname.startsWith("/api/v1/webhooks")) {
    return MAX_WEBHOOK_BODY_BYTES;
  }
  return MAX_JSON_BODY_BYTES;
}

export async function readBody(
  req: IncomingMessage,
  pathname = "/",
): Promise<{ rawBody: string | null; rawBuffer: Buffer | null; body: unknown }> {
  const method = req.method ?? "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { rawBody: null, rawBuffer: null, body: undefined };
  }

  const limit = resolveBodyLimit(pathname);
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > limit) {
      throw new BodyTooLargeError(limit);
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) {
    return { rawBody: null, rawBuffer: null, body: undefined };
  }

  const rawBuffer = Buffer.concat(chunks);
  const raw = rawBuffer.toString("utf8").trim();
  if (!raw) {
    return { rawBody: null, rawBuffer: null, body: undefined };
  }

  const contentType = req.headers["content-type"];
  const resolvedType = Array.isArray(contentType) ? contentType[0] : contentType;

  if (resolvedType?.includes("multipart/form-data")) {
    return { rawBody: null, rawBuffer, body: undefined };
  }

  if (!resolvedType?.includes("application/json")) {
    return { rawBody: raw, rawBuffer: null, body: undefined };
  }

  return { rawBody: raw, rawBuffer: null, body: JSON.parse(raw) };
}
