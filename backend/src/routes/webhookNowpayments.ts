import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import { captureBackendException } from "../observability.js";
import {
  appendInvoiceEventImmutable,
  claimWebhookReceipt,
  verifyNowpaymentsIpnSignature,
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
  const status = normalizePaymentStatus(payload);
  if (payload.id) {
    return `nowpayments:${payload.id}:${status}`;
  }
  return `nowpayments:invoice:${payload.data.invoice_id ?? payload.data.external_ref ?? payload.data.order_id}:${status}`;
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

function terminalUnsuccessfulInvoiceStatus(status: string): string | null {
  if (["failed", "expired", "refunded"].includes(status)) {
    return status;
  }
  return null;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function parseProviderPackageSku(sku: string | null | undefined): { packageName: string; durationDays: number } | null {
  const match = /^lbv-provider-(basic|featured|premium)-(weekly|monthly)$/.exec(String(sku ?? ""));
  if (!match) {
    return null;
  }

  return {
    packageName: match[1],
    durationDays: match[2] === "monthly" ? 30 : 7,
  };
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function resolvePackageExpiry(existingExpiry: string | null | undefined, durationDays: number, now: Date): string {
  const existing = existingExpiry ? new Date(`${existingExpiry}T00:00:00Z`) : null;
  const base = existing && Number.isFinite(existing.getTime()) && existing > now ? existing : now;
  return dateOnly(addDays(base, durationDays));
}

async function applyProviderPackageUpgrade(prisma: any, invoice: any, now: Date): Promise<boolean> {
  const packageConfig = parseProviderPackageSku(invoice.order?.product?.sku);
  const userId = invoice.order?.userId;
  if (!packageConfig || !userId) {
    return false;
  }

  const provider = await prisma.provider.findFirst({
    where: { user_id: userId },
    orderBy: { created_date: "desc" },
  });
  if (!provider) {
    return false;
  }

  await prisma.$executeRaw`
    UPDATE "Provider"
    SET
      ad_package = ${packageConfig.packageName},
      ad_package_started_at = ${now.toISOString()},
      ad_package_expiry = to_char(
        (
          GREATEST(
            COALESCE(
              NULLIF(ad_package_expiry, '')::date,
              (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')::date
            ),
            (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')::date
          ) + ${packageConfig.durationDays}::integer
        ),
        'YYYY-MM-DD'
      ),
      ad_package_expiration_reminder_sent_at = NULL,
      is_premium = ${["featured", "premium"].includes(packageConfig.packageName)}
    WHERE id = ${provider.id}::uuid
  `;
  return true;
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

function resolvePaidAmountCents(payload: NowpaymentsWebhookPayload, rawBody: unknown): number | null {
  if (typeof payload.data.amount_cents === "number") {
    return payload.data.amount_cents;
  }

  if (!rawBody || typeof rawBody !== "object") {
    return null;
  }

  const raw = rawBody as Record<string, unknown>;
  // Prefer the actually-paid amount: price_amount is the full invoice price
  // echoed even on underpaid "finished" payments, so trusting it first lets
  // underpayments pass as fully paid.
  const priceAmount = raw.actually_paid_at_fiat ?? raw.price_amount;
  if (typeof priceAmount === "number" && Number.isFinite(priceAmount)) {
    return Math.round(priceAmount * 100);
  }
  if (typeof priceAmount === "string") {
    const parsed = Number(priceAmount);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100);
    }
  }

  return null;
}

function paymentAmountSatisfiesInvoice(
  payload: NowpaymentsWebhookPayload,
  rawBody: unknown,
  invoiceAmountCents: number,
): boolean {
  const paidCents = resolvePaidAmountCents(payload, rawBody);
  return paidCents !== null && paidCents >= invoiceAmountCents;
}

export async function nowpaymentsWebhookHandler(
  request: ApiRequest,
  context: NowpaymentsWebhookContext,
): Promise<ApiResponse> {
  if (!request.rawBody) {
    return json(400, { error: "invalid_webhook", message: "Raw payload required" });
  }

  const signatureHeader = process.env.NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER ?? "x-nowpayments-sig";
  const signature = getHeader(request.headers, signatureHeader);
  const verified = verifyNowpaymentsIpnSignature({
    rawBody: request.rawBody,
    signature,
    timestamp: null,
    secret: process.env.NOWPAYMENTS_IPN_SECRET ?? process.env.NOWPAYMENTS_WEBHOOK_SECRET,
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

  const invoiceLookup = invoiceRef
    ? [{ externalRef: invoiceRef }, ...(isUuid(invoiceRef) ? [{ id: invoiceRef }] : [])]
    : [];

  const invoice = await context.prisma.invoice.findFirst({
    where: {
      OR: invoiceLookup,
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
  let providerPackageUpgraded = false;
  let invoiceStatus = invoice.status;

  if (shouldGrantEntitlement(paymentStatus)) {
    if (!paymentAmountSatisfiesInvoice(payload, request.body, invoice.amountCents)) {
      invoiceStatus = "pending_manual";
      await context.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: invoiceStatus },
      });
      await context.prisma.order.update({
        where: { id: invoice.orderId },
        data: { status: invoiceStatus },
      });
      await context.auditLogger.append({
        actorId: null,
        action: "nowpayments.webhook.underpaid",
        resourceType: "invoice",
        resourceId: invoice.id,
        metadata: {
          eventKey,
          expectedAmountCents: invoice.amountCents,
          paidAmountCents: resolvePaidAmountCents(payload, request.body),
          paymentStatus,
          requestId: request.requestId,
        },
      });
    } else {
    const paidAt = new Date();
    invoiceStatus = "paid";
    const paidUpdate = await context.prisma.invoice.updateMany({
      where: { id: invoice.id, status: { not: "paid" } },
      data: { status: invoiceStatus, paidAt },
    });
    await context.prisma.order.update({
      where: { id: invoice.orderId },
      data: { status: "paid" },
    });

    if (paidUpdate.count > 0) {
      const entitlement = payload.data.entitlement ?? "purchase_access";
      await grantEntitlementIfMissing(context.prisma, invoice.orderId, entitlement, {
        provider: "nowpayments",
        eventKey,
        invoiceId: invoice.id,
        paymentStatus,
        grantedAfterExpiry: paymentStatus === "paid" && invoice.status === "expired",
      });
      entitlementGranted = true;
      providerPackageUpgraded = await applyProviderPackageUpgrade(context.prisma, invoice, paidAt);
    }
    }
  } else if (isPartialPayment(paymentStatus)) {
    invoiceStatus = "pending_manual";
    await context.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: invoiceStatus },
    });
    await context.prisma.order.update({
      where: { id: invoice.orderId },
      data: { status: invoiceStatus },
    });
  } else {
    const terminalStatus = terminalUnsuccessfulInvoiceStatus(paymentStatus);
    if (terminalStatus) {
      invoiceStatus = terminalStatus;
      await context.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: invoiceStatus },
      });
      await context.prisma.order.update({
        where: { id: invoice.orderId },
        data: { status: invoiceStatus },
      });
    }
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
      providerPackageUpgraded,
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
