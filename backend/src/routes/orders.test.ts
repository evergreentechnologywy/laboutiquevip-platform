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
  assert.equal(requestBody.callback_url, "https://api.laboutiquevip.test/api/v1/webhooks/nowpayments");
  assert.equal(requestBody.success_url, "https://app.laboutiquevip.test/dashboard?payment=success");
  assert.equal(requestBody.cancel_url, "https://app.laboutiquevip.test/dashboard?payment=cancelled");
  assert.equal(createCalls.length, 1);
  assert.equal(updateCalls.length, 1);
  assert.equal((auditEvents[0]?.metadata as any)?.hasNowpayments, true);
});
