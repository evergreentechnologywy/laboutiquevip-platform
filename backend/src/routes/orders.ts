import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import { captureBackendException } from "../observability.js";
import { sendPaymentInitiatedEmail } from "../services/email.js";

interface OrdersContext {
  prisma: any;
  auditLogger: AuditLogger;
}

const PROVIDER_PACKAGE_PRODUCTS: Record<string, { name: string; description: string; amountCents: number; currency: string }> = {
  "lbv-provider-basic-weekly": {
    name: "Provider Basic Weekly",
    description: "La Boutique VIP weekly Basic provider visibility package",
    amountCents: 1900,
    currency: "USD",
  },
  "lbv-provider-basic-monthly": {
    name: "Provider Basic Monthly",
    description: "La Boutique VIP monthly Basic provider visibility package",
    amountCents: 5900,
    currency: "USD",
  },
  "lbv-provider-featured-weekly": {
    name: "Provider Featured Weekly",
    description: "La Boutique VIP weekly Featured provider visibility package",
    amountCents: 3900,
    currency: "USD",
  },
  "lbv-provider-featured-monthly": {
    name: "Provider Featured Monthly",
    description: "La Boutique VIP monthly Featured provider visibility package",
    amountCents: 11900,
    currency: "USD",
  },
  "lbv-provider-premium-weekly": {
    name: "Provider Premium Weekly",
    description: "La Boutique VIP weekly Premium provider visibility package",
    amountCents: 6900,
    currency: "USD",
  },
  "lbv-provider-premium-monthly": {
    name: "Provider Premium Monthly",
    description: "La Boutique VIP monthly Premium provider visibility package",
    amountCents: 19900,
    currency: "USD",
  },
};

const BLOCKED_PROVIDER_BILLING_STATUSES = new Set(["rejected", "suspended"]);

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

function isProviderPackageSku(sku?: string): boolean {
  return typeof sku === "string" && sku.startsWith("lbv-provider-");
}

async function ensureProviderCanStartPackageCheckout(prisma: any, userId: string, productSku?: string): Promise<ApiResponse | null> {
  if (!isProviderPackageSku(productSku)) {
    return null;
  }

  const provider = await prisma.provider.findFirst({
    where: { user_id: userId },
    select: { id: true, status: true },
  });

  if (!provider) {
    return json(409, {
      error: "provider_profile_required",
      message: "Create your provider profile before starting package checkout.",
    });
  }

  if (BLOCKED_PROVIDER_BILLING_STATUSES.has(provider.status)) {
    return json(403, {
      error: "provider_not_billable",
      message: "This provider profile cannot start paid package checkout while it is rejected or suspended.",
    });
  }

  return null;
}

async function ensureProviderPackageProduct(prisma: any, sku: string): Promise<any | null> {
  const packageProduct = PROVIDER_PACKAGE_PRODUCTS[sku];
  if (!packageProduct) {
    return null;
  }

  const billingUser = await prisma.user.upsert({
    where: { email: "billing@laboutiquevip.net" },
    update: {},
    create: {
      email: "billing@laboutiquevip.net",
      role: "system",
      status: "active",
      full_name: "La Boutique VIP Billing",
    },
  });

  let billingProfile = await prisma.profile.findFirst({
    where: {
      userId: billingUser.id,
      displayName: "La Boutique VIP Billing",
    },
  });

  if (!billingProfile) {
    billingProfile = await prisma.profile.create({
      data: {
        userId: billingUser.id,
        displayName: "La Boutique VIP Billing",
        bio: "System profile for provider package billing products.",
        city: "Online",
        country: "US",
        status: "active",
      },
    });
  }

  return prisma.product.upsert({
    where: { sku },
    update: {
      name: packageProduct.name,
      description: packageProduct.description,
      amountCents: packageProduct.amountCents,
      currency: packageProduct.currency,
      isActive: true,
    },
    create: {
      profileId: billingProfile.id,
      sku,
      name: packageProduct.name,
      description: packageProduct.description,
      amountCents: packageProduct.amountCents,
      currency: packageProduct.currency,
      isActive: true,
    },
  });
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
    productSku?: string;
    amountCents?: number;
    currency?: string;
    metadata?: Record<string, unknown>;
  };

  if (!payload.productId && !payload.productSku) {
    return json(400, { error: "validation_error", message: "productId or productSku is required" });
  }

  const billingGuard = await ensureProviderCanStartPackageCheckout(context.prisma, request.auth.userId, payload.productSku);
  if (billingGuard) {
    return billingGuard;
  }

  let product = payload.productId
    ? await context.prisma.product.findUnique({ where: { id: payload.productId } })
    : await context.prisma.product.findUnique({ where: { sku: payload.productSku } });

  if (!product && payload.productSku) {
    product = await ensureProviderPackageProduct(context.prisma, payload.productSku);
  }

  if (!product || product.isActive === false) {
    return json(404, { error: "not_found", message: "Product not found" });
  }

  const amountCents = product.amountCents ?? payload.amountCents;
  const currency = product.currency ?? payload.currency ?? "USD";
  if (typeof amountCents !== "number") {
    return json(400, { error: "validation_error", message: "Product amount is required" });
  }

  const order = await context.prisma.order.create({
    data: {
      userId: request.auth.userId,
      productId: product.id,
      amountCents,
      currency,
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

  // Create invoice for NOWPayments
  const invoice = await context.prisma.invoice.create({
    data: {
      orderId: order.id,
      status: "draft",
      amountCents,
      currency,
      externalRef: `lbv-${order.id}`,
    },
  });

  // If NOWPayments is configured, create a hosted payment session
  const hasNowpayments = Boolean(process.env.NOWPAYMENTS_API_KEY);
  let paymentUrl = null;
  let paymentError: string | null = null;

  if (hasNowpayments) {
    try {
      const nowpaymentsApiBaseUrl = process.env.NOWPAYMENTS_API_BASE_URL?.trim() || "https://api.nowpayments.io/v1";
      const nowpaymentsResponse = await fetch(`${nowpaymentsApiBaseUrl}/invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": String(process.env.NOWPAYMENTS_API_KEY),
        },
        body: JSON.stringify({
          price_amount: (amountCents / 100).toFixed(2),
          price_currency: currency.toLowerCase(),
          ipn_callback_url: `${process.env.API_BASE_URL || "https://www.laboutiquevip.net"}/api/v1/webhooks/nowpayments`,
          order_id: invoice.externalRef,
          order_description: `La Boutique VIP purchase for ${order.product?.profile?.displayName ?? "membership"}`,
          success_url: `${process.env.FRONTEND_URL || "https://www.laboutiquevip.net"}/providerdashboard?payment=success`,
          cancel_url: `${process.env.FRONTEND_URL || "https://www.laboutiquevip.net"}/providerdashboard?payment=cancelled`,
        }),
      });

      if (nowpaymentsResponse.ok) {
        const nowpaymentsData = await nowpaymentsResponse.json();
        paymentUrl = nowpaymentsData.invoice_url || nowpaymentsData.payment_url || nowpaymentsData.url || null;

        await context.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "issued",
          },
        });
        if (!paymentUrl) {
          paymentError = "Payment provider returned an invoice without a hosted payment URL.";
        }
      } else {
        const nowpaymentsBody = await nowpaymentsResponse.json().catch(() => ({}));
        paymentError = nowpaymentsBody?.message || "Payment provider could not create a checkout session.";
      }
    } catch (err) {
      captureBackendException(err, {
        route: "createOrderHandler",
        orderId: order.id,
        invoiceId: invoice.id,
      });
      console.error("NOWPayments invoice creation failed:", err);
      paymentError = "Payment provider request failed. Please try again in a moment.";
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
      productId: product.id,
      productSku: product.sku ?? payload.productSku,
      amountCents,
      hasNowpayments,
      paymentUrl: paymentUrl ? "created" : "failed",
      paymentError: paymentError ? "present" : "none",
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
    paymentError,
    mode: hasNowpayments ? "live" : "test_mode",
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
