import crypto from "node:crypto";
import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import { captureBackendException } from "../observability.js";
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
  if (["needs_review", "manual_review", "pending_review", "in review", "under_review"].includes(normalized)) {
    return "under_review";
  }
  if (["in_progress", "processing", "started"].includes(normalized)) {
    return "in_progress";
  }
  return "pending";
}

function getFrontendBaseUrl(): string {
  return process.env.FRONTEND_URL?.trim() || process.env.PUBLIC_BASE_URL?.trim() || "https://www.laboutiquevip.net";
}

function normalizeCallbackUrl(input: string): string {
  const base = new URL(getFrontendBaseUrl());
  const url = new URL(input, base);
  if (url.origin !== base.origin) {
    throw new Error("returnUrl must be on the configured frontend origin");
  }
  return url.toString();
}

function resolveDiditLaunchUrl(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.url,
    payload.launch_url,
    payload.session_url,
    payload.hosted_url,
    payload.redirect_url,
    payload.data?.url,
    payload.data?.launch_url,
    payload.data?.session_url,
    payload.data?.hosted_url,
    payload.data?.redirect_url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  return null;
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
  if (!hasCredentials) {
    return json(503, {
      error: "provider_unavailable",
      message: "Identity verification is not configured right now. Please contact support before continuing.",
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
  let callbackUrl: string;
  try {
    callbackUrl = normalizeCallbackUrl(payload.returnUrl);
  } catch {
    return json(400, {
      error: "validation_error",
      message: "returnUrl must use the configured frontend origin",
    });
  }
  const verificationWebhookUrl = `${process.env.API_BASE_URL?.trim() || process.env.PUBLIC_BASE_URL?.trim() || "https://www.laboutiquevip.net"}/api/v1/webhooks/didit`;

  try {
    const diditResponse = await fetch("https://verification.didit.me/v3/session/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": String(process.env.DIDIT_API_KEY),
      },
      body: JSON.stringify({
        workflow_id: process.env.DIDIT_WORKFLOW_ID,
        vendor_data: verificationId,
        callback: callbackUrl,
        callback_method: "both",
        metadata: JSON.stringify({
          verificationId,
          userId: request.auth.userId,
          ...(payload.metadata ?? {}),
        }),
        contact_details: {},
      }),
    });

    const diditPayload = await diditResponse.json().catch(() => ({}));
    if (!diditResponse.ok) {
      await appendVerificationEventImmutable(context.prisma, verificationId, "didit.session.failed", {
        callbackUrl,
        providerSessionId,
        responseStatus: diditResponse.status,
        payload: diditPayload,
      });

      return json(502, {
        error: "provider_error",
        message: "Could not start identity verification right now.",
      });
    }

    const launchUrl = resolveDiditLaunchUrl(diditPayload);
    if (!launchUrl) {
      await appendVerificationEventImmutable(context.prisma, verificationId, "didit.session.invalid_response", {
        callbackUrl,
        providerSessionId,
        payload: diditPayload,
      });

      return json(502, {
        error: "provider_error",
        message: "Identity verification provider did not return a valid launch URL.",
      });
    }

    await appendVerificationEventImmutable(context.prisma, verificationId, "didit.session.created", {
      returnUrl: callbackUrl,
      providerSessionId,
      verificationWebhookUrl,
      metadata: payload.metadata ?? {},
      providerPayload: diditPayload,
    });

    await context.auditLogger.append({
      actorId: request.auth.userId,
      action: "verification.didit.session_created",
      resourceType: "verification",
      resourceId: verificationId ?? null,
      metadata: { providerSessionId, mode: "live_contract" },
    });

    return json(201, {
      verificationId,
      provider: "didit",
      providerSessionId,
      launchUrl,
      mode: "live_contract",
    });
  } catch (error) {
    captureBackendException(error, {
      route: "createDiditSessionHandler",
      verificationId,
      userId: request.auth.userId,
    });

    await appendVerificationEventImmutable(context.prisma, verificationId, "didit.session.exception", {
      callbackUrl,
      providerSessionId,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return json(502, {
      error: "provider_error",
      message: "Could not connect to identity verification provider.",
    });
  }
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

  if (status === "approved") {
    await context.prisma.provider.updateMany({
      where: { user_id: verification.userId },
      data: {
        is_verified: true,
        is_profile_approved: true,
        status: "active",
        rejection_reason: null,
      },
    });
  }

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
