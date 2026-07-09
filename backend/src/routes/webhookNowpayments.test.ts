import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { nowpaymentsWebhookHandler } from "./webhookNowpayments.js";

function sortObject(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result: Record<string, unknown>, key) => {
        result[key] = sortObject(value[key]);
        return result;
      }, {});
  }
  return value;
}

function signNowpaymentsPayload(payload: Record<string, unknown>, secret = "topsecret"): string {
  return crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(sortObject(payload)))
    .digest("hex");
}

function makeRequest(overrides: Record<string, unknown> = {}): any {
  const body: Record<string, unknown> = {
    payment_id: 123456789,
    invoice_id: "invoice-ext-1",
    payment_status: "finished",
    price_amount: 125,
    price_currency: "usd",
    pay_amount: 15,
    pay_currency: "trx",
    order_id: "lbv-order-1",
    order_description: "La Boutique VIP purchase for Ava",
    purchase_id: "purchase-1",
  };

  const rawBody = JSON.stringify(body);

  return {
    method: "POST",
    path: "/api/v1/webhooks/nowpayments",
    pathname: "/api/v1/webhooks/nowpayments",
    query: new URLSearchParams(),
    headers: {
      "x-nowpayments-sig": signNowpaymentsPayload(body),
    },
    ipAddress: "127.0.0.1",
    requestId: "req-webhook-1",
    rawBody,
    body,
    ...overrides,
  };
}

test("nowpaymentsWebhookHandler accepts documented NOWPayments IPN signature and flat payment payload", async () => {
  const previousSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  const previousLegacySecret = process.env.NOWPAYMENTS_WEBHOOK_SECRET;
  const previousHeader = process.env.NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER;

  process.env.NOWPAYMENTS_IPN_SECRET = "topsecret";
  delete process.env.NOWPAYMENTS_WEBHOOK_SECRET;
  delete process.env.NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER;

  const request = makeRequest();

  const invoiceEvents: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const entitlementCreates: Array<Record<string, unknown>> = [];
  const invoiceUpdates: Array<Record<string, unknown>> = [];
  const claims: Array<Record<string, unknown>> = [];
  let invoiceWhere: Record<string, unknown> | null = null;

  const prisma = {
    webhookEventReceipt: {
      create: async ({ data }: any) => {
        claims.push(data);
        return { id: "receipt-1" };
      },
    },
    invoice: {
      findFirst: async ({ where }: any) => {
        invoiceWhere = where;
        return {
          id: "invoice-1",
          orderId: "order-1",
          status: "issued",
          amountCents: 12500,
          currency: "USD",
          order: {
            user: { email: null },
            product: { profile: { displayName: "Ava" } },
          },
        };
      },
      updateMany: async ({ data }: any) => {
        invoiceUpdates.push(data);
        return { count: 1 };
      },
    },
    order: {
      update: async () => ({ id: "order-1" }),
    },
    invoiceEvent: {
      create: async ({ data }: any) => {
        invoiceEvents.push(data);
        return { id: "invoice-event-1" };
      },
    },
    entitlement: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        entitlementCreates.push(data);
        return { id: "entitlement-1" };
      },
    },
  };

  const response = await nowpaymentsWebhookHandler(request, {
    prisma,
    auditLogger: {
      append: async (entry: Record<string, unknown>) => {
        auditEvents.push(entry);
      },
    },
  } as any);

  if (previousSecret === undefined) delete process.env.NOWPAYMENTS_IPN_SECRET;
  else process.env.NOWPAYMENTS_IPN_SECRET = previousSecret;
  if (previousLegacySecret === undefined) delete process.env.NOWPAYMENTS_WEBHOOK_SECRET;
  else process.env.NOWPAYMENTS_WEBHOOK_SECRET = previousLegacySecret;
  if (previousHeader === undefined) delete process.env.NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER;
  else process.env.NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER = previousHeader;

  assert.equal(response.statusCode, 200);
  assert.equal(claims[0]?.provider, "nowpayments");
  assert.deepEqual(invoiceWhere, { OR: [{ externalRef: "lbv-order-1" }] });
  assert.equal(invoiceEvents[0]?.eventType, "nowpayments.finished");
  assert.equal(invoiceUpdates[0]?.status, "paid");
  assert.equal((entitlementCreates[0]?.metadata as any)?.provider, "nowpayments");
  assert.equal(auditEvents[0]?.action, "nowpayments.webhook.processed");
});

test("nowpaymentsWebhookHandler upgrades provider package after paid package invoice", async () => {
  const previousSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  process.env.NOWPAYMENTS_IPN_SECRET = "topsecret";

  const body: Record<string, unknown> = {
    payment_id: 456789,
    payment_status: "finished",
    price_amount: 39,
    order_id: "lbv-order-upgrade",
  };
  const request = makeRequest({
    rawBody: JSON.stringify(body),
    body,
    headers: {
      "x-nowpayments-sig": signNowpaymentsPayload(body),
    },
  });

  const providerUpdates: Array<Record<string, unknown>> = [];
  const rawUpdates: Array<unknown[]> = [];
  const prisma = {
    $executeRaw: async (...args: unknown[]) => {
      rawUpdates.push(args);
      return 1;
    },
    webhookEventReceipt: {
      create: async () => ({ id: "receipt-upgrade" }),
    },
    invoice: {
      findFirst: async () => ({
        id: "invoice-upgrade",
        orderId: "order-upgrade",
        status: "issued",
        amountCents: 3900,
        currency: "USD",
        order: {
          userId: "user-upgrade",
          user: { email: null },
          product: {
            sku: "lbv-provider-featured-weekly",
            profile: { displayName: "Provider Featured Weekly" },
          },
        },
      }),
      updateMany: async () => ({ count: 1 }),
    },
    order: {
      update: async () => ({ id: "order-upgrade" }),
    },
    invoiceEvent: {
      create: async () => ({ id: "invoice-event-upgrade" }),
    },
    entitlement: {
      findFirst: async () => null,
      create: async () => ({ id: "entitlement-upgrade" }),
    },
    provider: {
      findFirst: async () => ({
        id: "provider-upgrade",
        user_id: "user-upgrade",
        ad_package: "none",
        ad_package_expiry: null,
      }),
      update: async ({ data }: any) => {
        providerUpdates.push(data);
        return { id: "provider-upgrade", ...data };
      },
    },
  };

  const response = await nowpaymentsWebhookHandler(request, {
    prisma,
    auditLogger: { append: async () => undefined },
  } as any);

  if (previousSecret === undefined) delete process.env.NOWPAYMENTS_IPN_SECRET;
  else process.env.NOWPAYMENTS_IPN_SECRET = previousSecret;

  assert.equal(response.statusCode, 200);
  assert.equal(providerUpdates.length, 0);
  assert.equal(rawUpdates.length, 1);
});

test("nowpaymentsWebhookHandler records terminal unsuccessful payment results", async () => {
  const previousSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  process.env.NOWPAYMENTS_IPN_SECRET = "topsecret";

  const expectedStatuses: Record<string, string> = {
    failed: "failed",
    expired: "expired",
    refunded: "refunded",
  };

  for (const [paymentStatus, expectedInvoiceStatus] of Object.entries(expectedStatuses)) {
    const body: Record<string, unknown> = {
      payment_id: `terminal-${paymentStatus}`,
      payment_status: paymentStatus,
      order_id: `lbv-terminal-${paymentStatus}`,
    };
    const request = makeRequest({
      requestId: `req-terminal-${paymentStatus}`,
      rawBody: JSON.stringify(body),
      body,
      headers: {
        "x-nowpayments-sig": signNowpaymentsPayload(body),
      },
    });

    const invoiceUpdates: Array<Record<string, unknown>> = [];
    const entitlementCreates: Array<Record<string, unknown>> = [];
    const prisma = {
      webhookEventReceipt: {
        create: async () => ({ id: `receipt-${paymentStatus}` }),
      },
      invoice: {
        findFirst: async () => ({
          id: `invoice-${paymentStatus}`,
          orderId: `order-${paymentStatus}`,
          status: "issued",
          amountCents: 6900,
          currency: "USD",
          order: {
            user: { email: null },
            product: {
              sku: "lbv-provider-premium-weekly",
              profile: { displayName: "Provider Premium Weekly" },
            },
          },
        }),
        update: async ({ data }: any) => {
          invoiceUpdates.push(data);
          return { id: `invoice-${paymentStatus}`, ...data };
        },
      },
      order: {
        update: async ({ data }: any) => ({ id: `order-${paymentStatus}`, ...data }),
      },
      invoiceEvent: {
        create: async () => ({ id: `invoice-event-${paymentStatus}` }),
      },
      entitlement: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          entitlementCreates.push(data);
          return { id: `entitlement-${paymentStatus}` };
        },
      },
    };

    const response = await nowpaymentsWebhookHandler(request, {
      prisma,
      auditLogger: { append: async () => undefined },
    } as any);

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as any).invoiceStatus, expectedInvoiceStatus);
    assert.equal(invoiceUpdates[0]?.status, expectedInvoiceStatus);
    assert.equal(entitlementCreates.length, 0);
  }

  if (previousSecret === undefined) delete process.env.NOWPAYMENTS_IPN_SECRET;
  else process.env.NOWPAYMENTS_IPN_SECRET = previousSecret;
});

test("nowpaymentsWebhookHandler processes later successful status for the same payment id", async () => {
  const previousSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  process.env.NOWPAYMENTS_IPN_SECRET = "topsecret";

  const seenEventKeys = new Set<string>();
  const invoiceUpdates: Array<Record<string, unknown>> = [];
  const entitlementCreates: Array<Record<string, unknown>> = [];

  const prisma = {
    webhookEventReceipt: {
      create: async ({ data }: any) => {
        const key = `${data.provider}:${data.eventKey}`;
        if (seenEventKeys.has(key)) {
          const error: any = new Error("duplicate receipt");
          error.code = "P2002";
          throw error;
        }
        seenEventKeys.add(key);
        return { id: `receipt-${seenEventKeys.size}` };
      },
    },
    invoice: {
      findFirst: async () => ({
        id: "invoice-progressive",
        orderId: "order-progressive",
        status: "issued",
        amountCents: 6900,
        currency: "USD",
        order: {
          user: { email: null },
          product: {
            sku: "one-time-product",
            profile: { displayName: "One Time Product" },
          },
        },
      }),
      updateMany: async ({ data }: any) => {
        invoiceUpdates.push(data);
        return { count: 1 };
      },
    },
    order: {
      update: async () => ({ id: "order-progressive" }),
    },
    invoiceEvent: {
      create: async () => ({ id: "invoice-event-progressive" }),
    },
    entitlement: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        entitlementCreates.push(data);
        return { id: "entitlement-progressive" };
      },
    },
  };

  for (const paymentStatus of ["waiting", "finished"]) {
    const body: Record<string, unknown> = {
      payment_id: "same-payment-progressive",
      payment_status: paymentStatus,
      price_amount: 69,
      order_id: "lbv-progressive-order",
    };
    const response = await nowpaymentsWebhookHandler(makeRequest({
      requestId: `req-progressive-${paymentStatus}`,
      rawBody: JSON.stringify(body),
      body,
      headers: {
        "x-nowpayments-sig": signNowpaymentsPayload(body),
      },
    }), {
      prisma,
      auditLogger: { append: async () => undefined },
    } as any);

    assert.equal(response.statusCode, 200);
    assert.notEqual((response.body as any).deduplicated, true);
  }

  if (previousSecret === undefined) delete process.env.NOWPAYMENTS_IPN_SECRET;
  else process.env.NOWPAYMENTS_IPN_SECRET = previousSecret;

  assert.equal(invoiceUpdates[0]?.status, "paid");
  assert.equal(entitlementCreates.length, 1);
});

test("nowpaymentsWebhookHandler does not grant twice when success statuses repeat for an already paid invoice", async () => {
  const previousSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  process.env.NOWPAYMENTS_IPN_SECRET = "topsecret";

  let invoiceStatus = "issued";
  const entitlementCreates: Array<Record<string, unknown>> = [];
  const providerRawUpdates: Array<unknown[]> = [];

  const prisma = {
    $executeRaw: async (...args: unknown[]) => {
      providerRawUpdates.push(args);
      return 1;
    },
    webhookEventReceipt: {
      create: async () => ({ id: `receipt-repeat-${Math.random()}` }),
    },
    invoice: {
      findFirst: async () => ({
        id: "invoice-repeat",
        orderId: "order-repeat",
        status: invoiceStatus,
        amountCents: 6900,
        currency: "USD",
        order: {
          userId: "user-repeat",
          user: { email: null },
          product: {
            sku: "lbv-provider-premium-weekly",
            profile: { displayName: "Provider Premium Weekly" },
          },
        },
      }),
      updateMany: async ({ data }: any) => {
        if (invoiceStatus === "paid") {
          return { count: 0 };
        }
        invoiceStatus = data.status;
        return { count: 1 };
      },
    },
    order: {
      update: async () => ({ id: "order-repeat" }),
    },
    invoiceEvent: {
      create: async () => ({ id: "invoice-event-repeat" }),
    },
    entitlement: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        entitlementCreates.push(data);
        return { id: "entitlement-repeat" };
      },
    },
    provider: {
      findFirst: async () => ({
        id: "provider-repeat",
        user_id: "user-repeat",
        ad_package: "none",
        ad_package_expiry: null,
      }),
    },
  };

  for (const paymentStatus of ["confirmed", "finished"]) {
    const body: Record<string, unknown> = {
      payment_id: "same-invoice-repeat",
      payment_status: paymentStatus,
      price_amount: 69,
      order_id: "lbv-repeat-order",
    };
    const response = await nowpaymentsWebhookHandler(makeRequest({
      requestId: `req-repeat-${paymentStatus}`,
      rawBody: JSON.stringify(body),
      body,
      headers: {
        "x-nowpayments-sig": signNowpaymentsPayload(body),
      },
    }), {
      prisma,
      auditLogger: { append: async () => undefined },
    } as any);

    assert.equal(response.statusCode, 200);
  }

  if (previousSecret === undefined) delete process.env.NOWPAYMENTS_IPN_SECRET;
  else process.env.NOWPAYMENTS_IPN_SECRET = previousSecret;

  assert.equal(entitlementCreates.length, 1);
  assert.equal(providerRawUpdates.length, 1);
});

test("nowpaymentsWebhookHandler withholds entitlement when paid amount is below invoice", async () => {
  const previousSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  process.env.NOWPAYMENTS_IPN_SECRET = "topsecret";

  const body: Record<string, unknown> = {
    payment_id: 999001,
    invoice_id: "invoice-underpaid",
    payment_status: "finished",
    price_amount: 1,
    price_currency: "usd",
    order_id: "lbv-underpaid-order",
  };
  const request = makeRequest({
    rawBody: JSON.stringify(body),
    body,
    headers: {
      "x-nowpayments-sig": signNowpaymentsPayload(body),
    },
  });

  const entitlementCreates: Array<Record<string, unknown>> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  let updatedInvoiceStatus: string | undefined;

  const prisma = {
    webhookEventReceipt: {
      create: async () => ({ id: "receipt-underpaid" }),
    },
    invoice: {
      findFirst: async () => ({
        id: "invoice-underpaid",
        orderId: "order-underpaid",
        status: "issued",
        amountCents: 12500,
        currency: "USD",
        order: {
          user: { email: null },
          product: { profile: { displayName: "Ava" }, sku: null },
        },
      }),
      updateMany: async () => ({ count: 0 }),
      update: async ({ data }: any) => {
        updatedInvoiceStatus = data.status;
        return { id: "invoice-underpaid", ...data };
      },
    },
    order: {
      update: async ({ data }: any) => data,
    },
    invoiceEvent: {
      create: async () => ({ id: "event-underpaid" }),
    },
    entitlement: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        entitlementCreates.push(data);
        return { id: "entitlement-underpaid" };
      },
    },
  };

  const response = await nowpaymentsWebhookHandler(request, {
    prisma,
    auditLogger: {
      append: async (entry: Record<string, unknown>) => {
        auditEvents.push(entry);
      },
    },
  } as any);

  if (previousSecret === undefined) delete process.env.NOWPAYMENTS_IPN_SECRET;
  else process.env.NOWPAYMENTS_IPN_SECRET = previousSecret;

  assert.equal(response.statusCode, 200);
  assert.equal(entitlementCreates.length, 0);
  assert.equal(updatedInvoiceStatus, "pending_manual");
  assert.equal(auditEvents.some((entry) => entry.action === "nowpayments.webhook.underpaid"), true);
});
