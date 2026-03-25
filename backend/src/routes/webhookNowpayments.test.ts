import test from "node:test";
import assert from "node:assert/strict";
import { nowpaymentsWebhookHandler } from "./webhookNowpayments.js";

function makeRequest(overrides: Record<string, unknown> = {}): any {
  const body = {
    id: "event-1",
    type: "payment.updated",
    data: {
      invoice_id: "invoice-ext-1",
      external_ref: "lbv-order-1",
      status: "finished",
      entitlement: "purchase_access",
    },
  };

  const rawBody = JSON.stringify(body);

  return {
    method: "POST",
    path: "/api/v1/webhooks/nowpayments",
    pathname: "/api/v1/webhooks/nowpayments",
    query: new URLSearchParams(),
    headers: {
      "x-nowpayments-signature": "0d76f7c785d64cfb5ae58fa124ab95db850b6a6ce69d0747d5dcd33a33a4b31d",
    },
    ipAddress: "127.0.0.1",
    requestId: "req-webhook-1",
    rawBody,
    body,
    ...overrides,
  };
}

test("nowpaymentsWebhookHandler accepts NOWPayments signature/env naming and records NOWPayments events", async () => {
  const previousSecret = process.env.NOWPAYMENTS_WEBHOOK_SECRET;
  const previousHeader = process.env.NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER;

  process.env.NOWPAYMENTS_WEBHOOK_SECRET = "topsecret";
  process.env.NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER = "x-nowpayments-signature";

  const request = makeRequest({
    headers: {
      "x-nowpayments-signature": "8890b29f0a63facfbed65d3e32278da120e803bda90df8c9c9249c5544f22432",
    },
    rawBody: JSON.stringify({
      id: "event-1",
      type: "payment.updated",
      data: {
        external_ref: "lbv-order-1",
        status: "finished",
        entitlement: "purchase_access",
      },
    }),
    body: {
      id: "event-1",
      type: "payment.updated",
      data: {
        external_ref: "lbv-order-1",
        status: "finished",
        entitlement: "purchase_access",
      },
    },
  });

  const invoiceEvents: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const entitlementCreates: Array<Record<string, unknown>> = [];
  const invoiceUpdates: Array<Record<string, unknown>> = [];
  const claims: Array<Record<string, unknown>> = [];

  const prisma = {
    webhookEventReceipt: {
      create: async ({ data }: any) => {
        claims.push(data);
        return { id: "receipt-1" };
      },
    },
    invoice: {
      findFirst: async () => ({
        id: "invoice-1",
        orderId: "order-1",
        status: "issued",
        amountCents: 12500,
        currency: "USD",
        order: {
          user: { email: null },
          product: { profile: { displayName: "Ava" } },
        },
      }),
      update: async ({ data }: any) => {
        invoiceUpdates.push(data);
        return { id: "invoice-1", ...data };
      },
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

  if (previousSecret === undefined) delete process.env.NOWPAYMENTS_WEBHOOK_SECRET;
  else process.env.NOWPAYMENTS_WEBHOOK_SECRET = previousSecret;
  if (previousHeader === undefined) delete process.env.NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER;
  else process.env.NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER = previousHeader;

  assert.equal(response.statusCode, 200);
  assert.equal(claims[0]?.provider, "nowpayments");
  assert.equal(invoiceEvents[0]?.eventType, "nowpayments.finished");
  assert.equal(invoiceUpdates[0]?.status, "paid");
  assert.equal((entitlementCreates[0]?.metadata as any)?.provider, "nowpayments");
  assert.equal(auditEvents[0]?.action, "nowpayments.webhook.processed");
});
