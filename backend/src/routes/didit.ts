import crypto from "node:crypto";
import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import {
  appendVerificationEventImmutable,
  claimWebhookReceipt,
  verifyTimestampedHmacSha256Signature,
} from "../services/webhooks.js";
import { diditWebhookSchema } from "../validation/webhooks.js";

interface DiditContext {
  prisma: any;
  auditLogger: AuditLogger;
}

interface DiditSessionRequest {
  verificationId?: string;
  returnUrl: string;
  metadata?: Record<string, unknown>;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

function getHeader(headers: ApiRequest["headers"], name: string): string | null {
  const value = headers[name];
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapDiditStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (["approved", "verified", "success", "completed"].includes(normalized)) {
    return "approved";
  }
  if (["rejected", "failed", "declined"].includes(normalized)) {
    return "rejected";
  }
  if (["needs_review", "manual_review", "pending_review"].includes(normalized)) {
    return "under_review";
  }
  return "pending";
}

export async function createDiditSessionHandler(
  request: ApiRequest,
  context: DiditContext,
): Promise<ApiResponse> {
  if (!request.auth?.userId) {
    return json(401, { error: "unauthorized" });
  }

  const payload = (request.body ?? {}) as DiditSessionRequest;
  if (!payload.returnUrl || typeof payload.returnUrl !== "string") {
    return json(400, { error: "validation_error", message: "returnUrl is required" });
  }

  const hasCredentials = Boolean(process.env.DIDIT_API_KEY && process.env.DIDIT_WORKFLOW_ID);
  if (!hasCredentials && process.env.NODE_ENV === "production") {
    return json(503, {
      error: "provider_unavailable",
      message: "Didit integration is not configured for production",
    });
  }

  let verificationId = payload.verificationId;
  if (verificationId) {
    const existing = await context.prisma.verification.findFirst({
      where: { id: verificationId, userId: request.auth.userId },
    });
    if (!existing) {
      return json(404, { error: "not_found", message: "Verification not found for user" });
    }
  } else {
    const created = await context.prisma.verification.create({
      data: {
        userId: request.auth.userId,
        type: "didit_identity",
        status: "pending",
        submittedAt: new Date(),
      },
    });
    verificationId = created.id;
  }

  if (!verificationId) {
    return json(500, { error: "internal_error", message: "Verification ID not resolved" });
  }

  const providerSessionId = crypto.randomUUID();
  await appendVerificationEventImmutable(context.prisma, verificationId, "didit.session.created", {
    returnUrl: payload.returnUrl,
    providerSessionId,
    metadata: payload.metadata ?? {},
  });

  await context.auditLogger.append({
    actorId: request.auth.userId,
    action: "verification.didit.session_created",
    resourceType: "verification",
    resourceId: verificationId ?? null,
    metadata: { providerSessionId, mode: hasCredentials ? "live_contract" : "placeholder_contract" },
  });

  return json(201, {
    verificationId,
    provider: "didit",
    providerSessionId,
    launchUrl: `https://verify.didit.me/session/${providerSessionId}`,
    mode: hasCredentials ? "live_contract" : "placeholder_contract",
  });
}

export async function diditWebhookHandler(
  request: ApiRequest,
  context: DiditContext,
): Promise<ApiResponse> {
  if (!request.rawBody) {
    return json(400, { error: "invalid_webhook", message: "Raw payload required" });
  }

  const signatureHeader = process.env.DIDIT_WEBHOOK_SIGNATURE_HEADER ?? "x-didit-signature";
  const timestampHeader = process.env.DIDIT_WEBHOOK_TIMESTAMP_HEADER ?? "x-didit-timestamp";
  const signature = getHeader(request.headers, signatureHeader);
  const timestamp = getHeader(request.headers, timestampHeader);
  const verified = verifyTimestampedHmacSha256Signature({
    rawBody: request.rawBody,
    signature,
    timestamp,
    secret: process.env.DIDIT_WEBHOOK_SECRET,
  });

  if (!verified.ok) {
    await context.auditLogger.append({
      actorId: null,
      action: "didit.webhook.rejected",
      resourceType: "webhook",
      resourceId: null,
      metadata: { reason: verified.reason, requestId: request.requestId },
    });
    return json(401, { error: "invalid_signature" });
  }

  const parsed = diditWebhookSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return json(400, {
      error: "validation_error",
      message: "Invalid Didit webhook payload",
      details: parsed.error.flatten(),
    });
  }

  const payload = parsed.data;
  const eventKey = `didit:${payload.id}`;

  const claim = await claimWebhookReceipt(
    context.prisma,
    "didit",
    eventKey,
    request.requestId,
    request.rawBody,
  );
  if (!claim.firstSeen) {
    return json(200, { ok: true, deduplicated: true });
  }

  const verificationRef = payload.verification_id ?? payload.external_verification_ref;

  const verification = await context.prisma.verification.findFirst({
    where: {
      OR: [{ id: verificationRef }],
    },
  });

  if (!verification) {
    await context.auditLogger.append({
      actorId: null,
      action: "didit.webhook.unmatched_verification",
      resourceType: "verification",
      resourceId: null,
      metadata: { verificationRef, eventKey },
    });
    return json(202, { ok: true, unmatched: true });
  }

  const status = mapDiditStatus(payload.status ?? payload.event ?? "pending");
  await context.prisma.verification.update({
    where: { id: verification.id },
    data: {
      status,
      reviewedAt: status === "pending" ? null : new Date(),
      submittedAt: verification.submittedAt ?? new Date(),
    },
  });

  await appendVerificationEventImmutable(context.prisma, verification.id, `didit.${status}`, {
    eventKey,
    payload,
    requestId: request.requestId,
  });

  await context.auditLogger.append({
    actorId: null,
    action: "didit.webhook.processed",
    resourceType: "verification",
    resourceId: verification.id,
    metadata: { eventKey, status, requestId: request.requestId },
  });

  return json(200, { ok: true, verificationId: verification.id, status });
}
