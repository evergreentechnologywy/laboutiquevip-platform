import sharp from "sharp";

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const GIF_MAGIC = [0x47, 0x49, 0x46, 0x38];

function startsWithBytes(buffer: Buffer, prefix: number[]): boolean {
  if (buffer.length < prefix.length) return false;
  return prefix.every((byte, index) => buffer[index] === byte);
}

export function detectImageContentType(buffer: Buffer): string | null {
  if (startsWithBytes(buffer, JPEG_MAGIC)) return "image/jpeg";
  if (startsWithBytes(buffer, PNG_MAGIC)) return "image/png";
  if (startsWithBytes(buffer, GIF_MAGIC)) return "image/gif";
  if (startsWithBytes(buffer, WEBP_RIFF) && buffer.length >= 12) {
    const webpTag = buffer.subarray(8, 12).toString("ascii");
    if (webpTag === "WEBP") return "image/webp";
  }
  return null;
}

export function validateImageMagicBytes(buffer: Buffer, declaredContentType: string): boolean {
  const detected = detectImageContentType(buffer);
  if (!detected) return false;
  if (declaredContentType === "image/jpg") return detected === "image/jpeg";
  return detected === declaredContentType;
}

/** Strip EXIF/metadata by re-encoding through sharp. */
export async function sanitizeImageBuffer(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const normalizedType = contentType === "image/jpg" ? "image/jpeg" : contentType;
  const pipeline = sharp(buffer, { failOn: "error" }).rotate();

  if (normalizedType === "image/png") {
    return { buffer: await pipeline.png().toBuffer(), contentType: "image/png" };
  }
  if (normalizedType === "image/webp") {
    return { buffer: await pipeline.webp().toBuffer(), contentType: "image/webp" };
  }
  if (normalizedType === "image/gif") {
    return { buffer: await pipeline.gif().toBuffer(), contentType: "image/gif" };
  }

  return { buffer: await pipeline.jpeg({ mozjpeg: true }).toBuffer(), contentType: "image/jpeg" };
}
