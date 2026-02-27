import crypto from "node:crypto";
import { webhookToleranceSeconds } from "../config/security.js";

export type WebhookProvider = "confirmo" | "didit";

export interface SignatureVerificationInput {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string | undefined;
}

export interface SignatureVerificationResult {
  ok: boolean;
  reason?: string;
}

export interface WebhookClaimResult {
  firstSeen: boolean;
  receiptId?: string;
}

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function verifyHmacSha256Signature(input: SignatureVerificationInput): SignatureVerificationResult {
  if (!input.secret) {
    return { ok: false, reason: "missing_secret" };
  }
  if (!input.signature) {
    return { ok: false, reason: "missing_signature" };
  }

  const expected = crypto.createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
  if (!safeCompare(expected, input.signature)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}

export function verifyTimestampedHmacSha256Signature(input: SignatureVerificationInput): SignatureVerificationResult {
  if (!input.secret) {
    return { ok: false, reason: "missing_secret" };
  }
  if (!input.signature || !input.timestamp) {
    return { ok: false, reason: "missing_signature" };
  }

  const tolerance = webhookToleranceSeconds();
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > tolerance) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = crypto
    .createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest("hex");
  if (!safeCompare(expected, input.signature)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}

export async function claimWebhookReceipt(
  prisma: any,
  provider: WebhookProvider,
  eventKey: string,
  requestId: string,
  rawPayload: string,
): Promise<WebhookClaimResult> {
  try {
    const created = await prisma.webhookEventReceipt.create({
      data: {
        provider,
        eventKey,
        requestId,
        payloadSha256: crypto.createHash("sha256").update(rawPayload).digest("hex"),
      },
    });
    return { firstSeen: true, receiptId: created.id };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return { firstSeen: false };
    }
    throw error;
  }
}

export async function appendInvoiceEventImmutable(
  prisma: any,
  invoiceId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId,
      eventType,
      payload,
    },
  });
}

export async function appendVerificationEventImmutable(
  prisma: any,
  verificationId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.verificationEvent.create({
    data: {
      verificationId,
      eventType,
      payload,
    },
  });
}

