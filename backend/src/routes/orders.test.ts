import test from "node:test";
import assert from "node:assert/strict";
import { createOrderHandler } from "./orders.js";

function makeRequest(overrides: Record<string, unknown> = {}): any {
  return {
    method: "POST",
    path: "/api/v1/orders",
    pathname: "/api/v1/orders",
    query: new URLSearchParams(),
    headers: {},
    ipAddress: "127.0.0.1",
    requestId: "req-orders-1",
    rawBody: null,
    auth: { userId: "user-1", roles: ["member"] },
    body: {
      productId: "product-1",
      amountCents: 12500,
      currency: "USD",
      metadata: { source: "test" },
    },
    ...overrides,
  };
}

test("createOrderHandler uses NOWPayments-only env and webhook route", async () => {
  const previousApiKey = process.env.NOWPAYMENTS_API_KEY;
  const previousApiBaseUrl = process.env.NOWPAYMENTS_API_BASE_URL;
  const previousApiBase = process.env.API_BASE_URL;
  const previousFrontend = process.env.FRONTEND_URL;
  const originalFetch = globalThis.fetch;

  process.env.NOWPAYMENTS_API_KEY = "np-api-key";
  process.env.NOWPAYMENTS_API_BASE_URL = "https://api.nowpayments.test/v1";
  process.env.API_BASE_URL = "https://api.laboutiquevip.test";
  process.env.FRONTEND_URL = "https://app.laboutiquevip.test";

  let fetchUrl = "";
  let fetchInit: RequestInit | undefined;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchUrl = String(url);
    fetchInit = init;

    return new Response(
      JSON.stringify({
        id: "np-external-1",
        invoice_url: "https://pay.nowpayments.test/invoice/1",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  const createCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];

  const prisma = {
    product: {
      findUnique: async () => ({
        id: "product-1",
        amountCents: 12500,
        currency: "USD",
        profile: { displayName: "Ava" },
      }),
    },
    order: {
      create: async ({ data }: any) => ({
        id: "order-1",
        ...data,
        user: { email: null },
        product: { profile: { displayName: "Ava" } },
      }),
    },
    invoice: {
      create: async ({ data }: any) => {
        createCalls.push(data);
        return { id: "invoice-1", ...data };
      },
      update: async ({ data }: any) => {
        updateCalls.push(data);
        return { id: "invoice-1", ...data };
      },
    },
  };

  const auditEvents: Array<Record<string, unknown>> = [];
  const response = await createOrderHandler(makeRequest(), {
    prisma,
    auditLogger: {
      append: async (entry: Record<string, unknown>) => {
        auditEvents.push(entry);
      },
    },
  } as any);

  globalThis.fetch = originalFetch;
  if (previousApiKey === undefined) delete process.env.NOWPAYMENTS_API_KEY;
  else process.env.NOWPAYMENTS_API_KEY = previousApiKey;
  if (previousApiBaseUrl === undefined) delete process.env.NOWPAYMENTS_API_BASE_URL;
  else process.env.NOWPAYMENTS_API_BASE_URL = previousApiBaseUrl;
  if (previousApiBase === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = previousApiBase;
  if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = previousFrontend;

  assert.equal(response.statusCode, 201);
  assert.equal(fetchUrl, "https://api.nowpayments.test/v1/invoice");
  assert.equal(fetchInit?.headers && (fetchInit.headers as Record<string, string>)["x-api-key"], "np-api-key");
  assert.equal((response.body as any).paymentUrl, "https://pay.nowpayments.test/invoice/1");
  assert.equal((response.body as any).mode, "live");

  const requestBody = JSON.parse(String(fetchInit?.body));
  assert.equal(requestBody.price_amount, "125.00");
  assert.equal(requestBody.price_currency, "usd");
  assert.equal(requestBody.ipn_callback_url, "https://api.laboutiquevip.test/api/v1/webhooks/nowpayments");
  assert.equal(requestBody.order_id, "lbv-order-1");
  assert.equal(requestBody.order_description, "La Boutique VIP purchase for Ava");
  assert.equal(requestBody.success_url, "https://app.laboutiquevip.test/providerdashboard?payment=success");
  assert.equal(requestBody.cancel_url, "https://app.laboutiquevip.test/providerdashboard?payment=cancelled");
  assert.equal("metadata" in requestBody, false);
  assert.equal(createCalls[0]?.amountCents, 12500);
  assert.equal(updateCalls.length, 1);
  assert.equal((auditEvents[0]?.metadata as any)?.hasNowpayments, true);
});

test("createOrderHandler ignores client-supplied amountCents", async () => {
  const createCalls: Array<Record<string, unknown>> = [];
  const prisma = {
    product: {
      findUnique: async () => ({
        id: "product-1",
        amountCents: 5900,
        currency: "USD",
        isActive: true,
      }),
    },
    order: {
      create: async ({ data }: any) => {
        createCalls.push(data);
        return { id: "order-1", ...data, user: { email: null }, product: { profile: { displayName: "Ava" } } };
      },
    },
    invoice: {
      create: async ({ data }: any) => ({ id: "invoice-1", ...data }),
      update: async () => ({ id: "invoice-1" }),
    },
  };

  const response = await createOrderHandler(
    makeRequest({ body: { productId: "product-1", amountCents: 100, currency: "EUR" } }),
    {
      prisma,
      auditLogger: { append: async () => {} },
    } as any,
  );

  assert.equal(response.statusCode, 201);
  assert.equal(createCalls[0]?.amountCents, 5900);
  assert.equal(createCalls[0]?.currency, "USD");
});

test("createOrderHandler resolves provider package products by sku", async () => {
  const previousApiKey = process.env.NOWPAYMENTS_API_KEY;
  delete process.env.NOWPAYMENTS_API_KEY;

  const prisma = {
    provider: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.user_id, "user-1");
        return { id: "provider-active", status: "active" };
      },
    },
    product: {
      findUnique: async ({ where }: any) => {
        assert.equal(where.sku, "lbv-provider-basic-weekly");
        return {
          id: "product-basic-weekly",
          sku: "lbv-provider-basic-weekly",
          amountCents: 1900,
          currency: "USD",
          isActive: true,
        };
      },
    },
    order: {
      create: async ({ data }: any) => ({
        id: "order-basic-weekly",
        ...data,
        user: { email: null },
        product: { profile: { displayName: "La Boutique VIP Provider Basic Weekly" } },
      }),
    },
    invoice: {
      create: async ({ data }: any) => ({ id: "invoice-basic-weekly", ...data }),
    },
  };

  const response = await createOrderHandler(makeRequest({
    body: {
      productSku: "lbv-provider-basic-weekly",
      currency: "USD",
    },
  }), {
    prisma,
    auditLogger: { append: async () => undefined },
  } as any);

  if (previousApiKey === undefined) delete process.env.NOWPAYMENTS_API_KEY;
  else process.env.NOWPAYMENTS_API_KEY = previousApiKey;

  assert.equal(response.statusCode, 201);
  assert.equal((response.body as any).amount.cents, 1900);
  assert.equal((response.body as any).mode, "test_mode");
});

test("createOrderHandler blocks provider package checkout for rejected or suspended providers", async () => {
  const blockedStatuses = ["rejected", "suspended"];

  for (const status of blockedStatuses) {
    const prisma = {
      provider: {
        findFirst: async ({ where }: any) => {
          assert.equal(where.user_id, "user-1");
          return {
            id: `provider-${status}`,
            user_id: "user-1",
            status,
            is_profile_approved: false,
          };
        },
      },
      product: {
        findUnique: async () => {
          throw new Error("product lookup should not run for blocked providers");
        },
      },
    };

    const response = await createOrderHandler(makeRequest({
      body: {
        productSku: "lbv-provider-premium-weekly",
        currency: "USD",
      },
    }), {
      prisma,
      auditLogger: { append: async () => undefined },
    } as any);

    assert.equal(response.statusCode, 403);
    assert.equal((response.body as any).error, "provider_not_billable");
  }
});

test("createOrderHandler maps all provider package skus to expected amounts", async () => {
  const previousApiKey = process.env.NOWPAYMENTS_API_KEY;
  delete process.env.NOWPAYMENTS_API_KEY;

  const expectedAmounts: Record<string, number> = {
    "lbv-provider-basic-weekly": 1900,
    "lbv-provider-basic-monthly": 5900,
    "lbv-provider-featured-weekly": 3900,
    "lbv-provider-featured-monthly": 11900,
    "lbv-provider-premium-weekly": 6900,
    "lbv-provider-premium-monthly": 19900,
  };

  for (const [productSku, amountCents] of Object.entries(expectedAmounts)) {
    const prisma = {
      provider: {
        findFirst: async () => ({ id: "provider-active", status: "active" }),
      },
      product: {
        findUnique: async () => null,
        upsert: async ({ create }: any) => ({ id: `product-${productSku}`, ...create }),
      },
      user: {
        upsert: async () => ({ id: "billing-user-1" }),
      },
      profile: {
        findFirst: async () => ({ id: "billing-profile-1" }),
      },
      order: {
        create: async ({ data }: any) => ({
          id: `order-${productSku}`,
          ...data,
          user: { email: null },
          product: { sku: productSku, profile: { displayName: productSku } },
        }),
      },
      invoice: {
        create: async ({ data }: any) => ({ id: `invoice-${productSku}`, ...data }),
      },
    };

    const response = await createOrderHandler(makeRequest({
      body: { productSku, currency: "USD" },
    }), {
      prisma,
      auditLogger: { append: async () => undefined },
    } as any);

    assert.equal(response.statusCode, 201);
    assert.equal((response.body as any).amount.cents, amountCents);
  }

  if (previousApiKey === undefined) delete process.env.NOWPAYMENTS_API_KEY;
  else process.env.NOWPAYMENTS_API_KEY = previousApiKey;
});
