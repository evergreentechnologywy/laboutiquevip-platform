import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import { captureBackendException } from "../observability.js";
import { sendPaymentInitiatedEmail } from "../services/email.js";

interface OrdersContext {
  prisma: any;
  auditLogger: AuditLogger;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

export async function createOrderHandler(
  request: ApiRequest,
  context: OrdersContext,
): Promise<ApiResponse> {
  if (!request.auth?.userId) {
    return json(401, { error: "unauthorized" });
  }

  const payload = request.body as {
    productId?: string;
    amountCents?: number;
    currency?: string;
    metadata?: Record<string, unknown>;
  };

  if (!payload.productId || typeof payload.amountCents !== "number") {
    return json(400, { error: "validation_error", message: "productId and amountCents are required" });
  }

  const product = await context.prisma.product.findUnique({
    where: { id: payload.productId },
  });

  if (!product) {
    return json(404, { error: "not_found", message: "Product not found" });
  }

  const order = await context.prisma.order.create({
    data: {
      userId: request.auth.userId,
      productId: payload.productId,
      amountCents: payload.amountCents,
      currency: payload.currency || "USD",
      status: "pending",
    },
    include: {
      user: true,
      product: {
        include: {
          profile: true,
        },
      },
    },
  });

  // Create invoice for Confirmo
  const invoice = await context.prisma.invoice.create({
    data: {
      orderId: order.id,
      status: "draft",
      amountCents: payload.amountCents,
      currency: payload.currency || "USD",
      externalRef: `lbv-${order.id}`,
    },
  });

  // If Confirmo is configured, create payment session
  const hasConfirmo = Boolean(process.env.CONFIRMO_API_KEY);
  let paymentUrl = null;

  if (hasConfirmo) {
    try {
      const confirmoResponse = await fetch("https://api.confirmo.net/v3/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.CONFIRMO_API_KEY}`,
        },
        body: JSON.stringify({
          amount: (payload.amountCents / 100).toFixed(2),
          currency: payload.currency || "USD",
          external_ref: invoice.externalRef,
          callback_url: `${process.env.API_BASE_URL || "https://www.laboutiquevip.net"}/api/v1/webhooks/confirmo`,
          success_url: `${process.env.FRONTEND_URL || "https://www.laboutiquevip.net"}/dashboard?payment=success`,
          cancel_url: `${process.env.FRONTEND_URL || "https://www.laboutiquevip.net"}/dashboard?payment=cancelled`,
          metadata: {
            orderId: order.id,
            invoiceId: invoice.id,
            userId: request.auth.userId,
            ...payload.metadata,
          },
        }),
      });

      if (confirmoResponse.ok) {
        const confirmoData = await confirmoResponse.json();
        paymentUrl = confirmoData.payment_url || confirmoData.url;

        await context.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "issued",
            externalRef: confirmoData.id || invoice.externalRef,
          },
        });
      }
    } catch (err) {
      captureBackendException(err, {
        route: "createOrderHandler",
        orderId: order.id,
        invoiceId: invoice.id,
      });
      console.error("Confirmo invoice creation failed:", err);
    }
  }

  if (paymentUrl && order.user?.email) {
    try {
      await sendPaymentInitiatedEmail({
        to: order.user.email,
        displayName: order.product?.profile?.displayName ?? null,
        amountCents: order.amountCents,
        currency: order.currency,
        paymentUrl,
      });
    } catch (err) {
      captureBackendException(err, {
        route: "createOrderHandler.email",
        orderId: order.id,
        invoiceId: invoice.id,
      });
    }
  }

  await context.auditLogger.append({
    actorId: request.auth.userId,
    action: "order.created",
    resourceType: "order",
    resourceId: order.id,
    metadata: { 
      productId: payload.productId, 
      amountCents: payload.amountCents,
      hasConfirmo,
      paymentUrl: paymentUrl ? "created" : "failed",
    },
  });

  return json(201, {
    orderId: order.id,
    invoiceId: invoice.id,
    status: order.status,
    amount: {
      cents: order.amountCents,
      currency: order.currency,
    },
    paymentUrl,
    mode: hasConfirmo ? "live" : "test_mode",
  });
}

export async function getOrderHandler(
  request: ApiRequest,
  context: OrdersContext,
): Promise<ApiResponse> {
  if (!request.auth?.userId) {
    return json(401, { error: "unauthorized" });
  }

  const orderId = request.query.get("id");
  if (!orderId) {
    return json(400, { error: "validation_error", message: "Order ID required" });
  }

  const order = await context.prisma.order.findFirst({
    where: { 
      id: orderId,
      userId: request.auth.userId,
    },
    include: {
      invoices: true,
      entitlements: true,
    },
  });

  if (!order) {
    return json(404, { error: "not_found" });
  }

  return json(200, order);
}

export async function listUserOrdersHandler(
  request: ApiRequest,
  context: OrdersContext,
): Promise<ApiResponse> {
  if (!request.auth?.userId) {
    return json(401, { error: "unauthorized" });
  }

  const orders = await context.prisma.order.findMany({
    where: { userId: request.auth.userId },
    include: {
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      entitlements: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return json(200, orders);
}
