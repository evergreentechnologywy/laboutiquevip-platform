import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import {
  appendInvoiceEventImmutable,
  claimWebhookReceipt,
  verifyHmacSha256Signature,
} from "../services/webhooks.js";

interface ConfirmoWebhookContext {
  prisma: any;
  auditLogger: AuditLogger;
}

interface ConfirmoEventPayload {
  id?: string;
  type?: string;
  data?: {
    invoice_id?: string;
    external_ref?: string;
    order_id?: string;
    status?: string;
    amount_cents?: number;
    currency?: string;
    entitlement?: string;
  };
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

function resolveEventKey(payload: ConfirmoEventPayload): string | null {
  if (payload.id) {
    return `confirmo:${payload.id}`;
  }
  if (payload.data?.invoice_id) {
    return `confirmo:invoice:${payload.data.invoice_id}:${payload.type ?? "unknown"}`;
  }
  return null;
}

async function grantEntitlementIfMissing(
  prisma: any,
  orderId: string,
  entitlement: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const existing = await prisma.entitlement.findFirst({
    where: { orderId, entitlement, status: "active" },
  });
  if (existing) {
    return;
  }

  await prisma.entitlement.create({
    data: {
      orderId,
      entitlement,
      metadata,
    },
  });
}

export async function confirmoWebhookHandler(
  request: ApiRequest,
  context: ConfirmoWebhookContext,
): Promise<ApiResponse> {
  if (!request.rawBody) {
    return json(400, { error: "invalid_webhook", message: "Raw payload required" });
  }

  const signatureHeader = process.env.CONFIRMO_WEBHOOK_SIGNATURE_HEADER ?? "x-confirmo-signature";
  const signature = getHeader(request.headers, signatureHeader);
  const verified = verifyHmacSha256Signature({
    rawBody: request.rawBody,
    signature,
    timestamp: null,
    secret: process.env.CONFIRMO_WEBHOOK_SECRET,
  });

  if (!verified.ok) {
    await context.auditLogger.append({
      actorId: null,
      action: "confirmo.webhook.rejected",
      resourceType: "webhook",
      resourceId: null,
      metadata: { reason: verified.reason, requestId: request.requestId },
    });
    return json(401, { error: "invalid_signature" });
  }

  const payload = (request.body ?? {}) as ConfirmoEventPayload;
  const eventKey = resolveEventKey(payload);
  if (!eventKey) {
    return json(400, { error: "invalid_event", message: "Event id or invoice reference required" });
  }

  const claim = await claimWebhookReceipt(
    context.prisma,
    "confirmo",
    eventKey,
    request.requestId,
    request.rawBody,
  );
  if (!claim.firstSeen) {
    return json(200, { ok: true, deduplicated: true });
  }

  const invoiceRef = payload.data?.external_ref ?? payload.data?.invoice_id ?? null;
  if (!invoiceRef) {
    await context.auditLogger.append({
      actorId: null,
      action: "confirmo.webhook.ignored",
      resourceType: "webhook",
      resourceId: claim.receiptId ?? null,
      metadata: { reason: "missing_invoice_reference", eventKey },
    });
    return json(202, { ok: true, ignored: true });
  }

  const invoice = await context.prisma.invoice.findFirst({
    where: {
      OR: [{ externalRef: invoiceRef }, { id: invoiceRef }],
    },
    include: { order: true },
  });

  if (!invoice) {
    await context.auditLogger.append({
      actorId: null,
      action: "confirmo.webhook.unmatched_invoice",
      resourceType: "invoice",
      resourceId: null,
      metadata: { invoiceRef, eventKey },
    });
    return json(202, { ok: true, unmatched: true });
  }

  const nextStatus = payload.data?.status ?? payload.type ?? "unknown";
  await appendInvoiceEventImmutable(context.prisma, invoice.id, `confirmo.${nextStatus}`, {
    eventKey,
    payload,
    requestId: request.requestId,
  });

  let entitlementGranted = false;
  if (["paid", "confirmed", "settled"].includes(nextStatus.toLowerCase())) {
    await context.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid", paidAt: new Date() },
    });

    const entitlement = payload.data?.entitlement ?? "purchase_access";
    await grantEntitlementIfMissing(context.prisma, invoice.orderId, entitlement, {
      provider: "confirmo",
      eventKey,
      invoiceId: invoice.id,
    });
    entitlementGranted = true;
  }

  await context.auditLogger.append({
    actorId: null,
    action: "confirmo.webhook.processed",
    resourceType: "invoice",
    resourceId: invoice.id,
    metadata: {
      eventKey,
      status: nextStatus,
      entitlementGranted,
      requestId: request.requestId,
    },
  });

  return json(200, { ok: true, invoiceId: invoice.id, entitlementGranted });
}

