import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import { applyVerificationApproval } from "../lib/verificationApproval.js";

interface AdminContext {
  prisma: any;
  auditLogger: AuditLogger;
}

interface VerificationReviewRequest {
  action: "approve" | "reject" | "needs_info";
  note?: string;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

function asInt(value: string | null, fallback: number): number {
  const numeric = Number(value ?? "");
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

export async function adminReportsQueueHandler(
  request: ApiRequest,
  context: AdminContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") ?? "open";
  const limit = Math.min(100, asInt(request.query.get("limit"), 25));

  const reports = await context.prisma.report.findMany({
    where: { status },
    include: {
      reporter: { select: { id: true, email: true } },
      targetUser: { select: { id: true, email: true } },
    },
    orderBy: [{ createdAt: "asc" }],
    take: limit,
  });

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "admin.reports.queue_read",
    resourceType: "report",
    resourceId: null,
    metadata: { status, limit },
  });

  return json(200, {
    status,
    count: reports.length,
    items: reports,
  });
}

export async function adminReviewVerificationHandler(
  request: ApiRequest,
  verificationId: string,
  context: AdminContext,
): Promise<ApiResponse> {
  const payload = (request.body ?? {}) as VerificationReviewRequest;
  if (!payload.action || !["approve", "reject", "needs_info"].includes(payload.action)) {
    return json(400, { error: "validation_error", message: "action must be approve|reject|needs_info" });
  }

  const nextStatus =
    payload.action === "approve"
      ? "approved"
      : payload.action === "reject"
        ? "rejected"
        : "under_review";

  const verification = await context.prisma.verification.findUnique({
    where: { id: verificationId },
  });
  if (!verification) {
    return json(404, { error: "not_found", message: "Verification not found" });
  }

  const updated = await context.prisma.verification.update({
    where: { id: verificationId },
    data: {
      status: nextStatus,
      reviewedAt: new Date(),
    },
  });

  if (nextStatus === "approved") {
    await applyVerificationApproval(context.prisma, verification.userId);
  }

  await context.prisma.verificationEvent.create({
    data: {
      verificationId,
      eventType: `admin.review.${payload.action}`,
      payload: {
        note: payload.note ?? null,
        actorId: request.auth?.userId ?? null,
      },
    },
  });

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "admin.verification.review",
    resourceType: "verification",
    resourceId: verificationId,
    metadata: { action: payload.action, note: payload.note ?? null },
  });

  return json(200, { verification: updated });
}

export async function adminBillingReconciliationHandler(
  request: ApiRequest,
  context: AdminContext,
): Promise<ApiResponse> {
  const status = request.query.get("status");
  const limit = Math.min(100, asInt(request.query.get("limit"), 50));

  const invoices = await context.prisma.invoice.findMany({
    where: status ? { status } : undefined,
    include: {
      order: {
        include: {
          entitlements: true,
          user: { select: { id: true, email: true } },
          product: { select: { id: true, sku: true, name: true } },
        },
      },
      invoiceEvents: {
        orderBy: [{ createdAt: "desc" }],
        take: 3,
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "admin.billing.reconciliation_read",
    resourceType: "invoice",
    resourceId: null,
    metadata: { status: status ?? "all", limit },
  });

  return json(200, {
    status: status ?? "all",
    count: invoices.length,
    items: invoices.map((invoice: any) => ({
      id: invoice.id,
      externalRef: invoice.externalRef,
      status: invoice.status,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      orderId: invoice.orderId,
      user: invoice.order?.user ?? null,
      product: invoice.order?.product ?? null,
      entitlementCount: invoice.order?.entitlements?.length ?? 0,
      latestEvents: invoice.invoiceEvents ?? [],
      updatedAt: invoice.updatedAt,
    })),
  });
}

