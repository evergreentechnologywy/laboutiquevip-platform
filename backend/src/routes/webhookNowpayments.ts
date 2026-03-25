import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import { captureBackendException } from "../observability.js";
import {
  appendInvoiceEventImmutable,
  claimWebhookReceipt,
  verifyHmacSha256Signature,
} from "../services/webhooks.js";
import {
  sendPaymentConfirmedEmail,
  sendPaymentNeedsReviewEmail,
} from "../services/email.js";
import { nowpaymentsWebhookSchema, type NowpaymentsWebhookPayload } from "../validation/webhooks.js";

interface NowpaymentsWebhookContext {
  prisma: any;
  auditLogger: AuditLogger;
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

function resolveEventKey(payload: NowpaymentsWebhookPayload): string {
  if (payload.id) {
    return `nowpayments:${payload.id}`;
  }
  return `nowpayments:invoice:${payload.data.invoice_id ?? payload.data.external_ref ?? payload.data.order_id}:${payload.type ?? "unknown"}`;
}

function normalizePaymentStatus(payload: NowpaymentsWebhookPayload): string {
  return (payload.data.status ?? payload.type).trim().toLowerCase();
}

function shouldGrantEntitlement(status: string): boolean {
  return ["paid", "confirmed", "finished", "settled"].includes(status);
}

function isPartialPayment(status: string): boolean {
  return status === "partially_paid";
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

export async function nowpaymentsWebhookHandler(
  request: ApiRequest,
  context: NowpaymentsWebhookContext,
): Promise<ApiResponse> {
  if (!request.rawBody) {
    return json(400, { error: "invalid_webhook", message: "Raw payload required" });
  }

  const signatureHeader = process.env.NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER ?? "x-nowpayments-signature";
  const signature = getHeader(request.headers, signatureHeader);
  const verified = verifyHmacSha256Signature({
    rawBody: request.rawBody,
    signature,
    timestamp: null,
    secret: process.env.NOWPAYMENTS_WEBHOOK_SECRET,
  });

  if (!verified.ok) {
    await context.auditLogger.append({
      actorId: null,
      action: "nowpayments.webhook.rejected",
      resourceType: "webhook",
      resourceId: null,
      metadata: { reason: verified.reason, requestId: request.requestId },
    });
    return json(401, { error: "invalid_signature" });
  }

  const parsed = nowpaymentsWebhookSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return json(400, {
      error: "validation_error",
      message: "Invalid NOWPayments webhook payload",
      details: parsed.error.flatten(),
    });
  }

  const payload = parsed.data;
  const eventKey = resolveEventKey(payload);

  const claim = await claimWebhookReceipt(
    context.prisma,
    "nowpayments",
    eventKey,
    request.requestId,
    request.rawBody,
  );
  if (!claim.firstSeen) {
    return json(200, { ok: true, deduplicated: true });
  }

  const invoiceRef = payload.data.external_ref ?? payload.data.invoice_id ?? payload.data.order_id;

  const invoice = await context.prisma.invoice.findFirst({
    where: {
      OR: [{ externalRef: invoiceRef }, { id: invoiceRef }],
    },
    include: {
      order: {
        include: {
          user: true,
          product: {
            include: {
              profile: true,
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    await context.auditLogger.append({
      actorId: null,
      action: "nowpayments.webhook.unmatched_invoice",
      resourceType: "invoice",
      resourceId: null,
      metadata: { invoiceRef, eventKey },
    });
    return json(202, { ok: true, unmatched: true });
  }

  const paymentStatus = normalizePaymentStatus(payload);
  await appendInvoiceEventImmutable(context.prisma, invoice.id, `nowpayments.${paymentStatus}`, {
    eventKey,
    payload,
    requestId: request.requestId,
  });

  let entitlementGranted = false;
  let invoiceStatus = invoice.status;

  if (shouldGrantEntitlement(paymentStatus)) {
    invoiceStatus = "paid";
    await context.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: invoiceStatus, paidAt: new Date() },
    });

    const entitlement = payload.data.entitlement ?? "purchase_access";
    await grantEntitlementIfMissing(context.prisma, invoice.orderId, entitlement, {
      provider: "nowpayments",
      eventKey,
      invoiceId: invoice.id,
      paymentStatus,
      grantedAfterExpiry: paymentStatus === "paid" && invoice.status === "expired",
    });
    entitlementGranted = true;
  } else if (isPartialPayment(paymentStatus)) {
    invoiceStatus = "pending_manual";
    await context.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: invoiceStatus },
    });
  }

  await context.auditLogger.append({
    actorId: null,
    action: "nowpayments.webhook.processed",
    resourceType: "invoice",
    resourceId: invoice.id,
    metadata: {
      eventKey,
      status: paymentStatus,
      invoiceStatus,
      entitlementGranted,
      requestId: request.requestId,
    },
  });

  const recipientEmail = invoice.order?.user?.email ?? null;
  if (recipientEmail) {
    try {
      if (entitlementGranted) {
        await sendPaymentConfirmedEmail({
          to: recipientEmail,
          displayName: invoice.order?.product?.profile?.displayName ?? null,
          amountCents: invoice.amountCents,
          currency: invoice.currency,
        });
      } else if (invoiceStatus === "pending_manual") {
        await sendPaymentNeedsReviewEmail({
          to: recipientEmail,
          displayName: invoice.order?.product?.profile?.displayName ?? null,
          amountCents: invoice.amountCents,
          currency: invoice.currency,
        });
      }
    } catch (err) {
      captureBackendException(err, {
        route: "nowpaymentsWebhookHandler.email",
        invoiceId: invoice.id,
        paymentStatus,
      });
    }
  }

  return json(200, { ok: true, invoiceId: invoice.id, entitlementGranted, invoiceStatus });
}
