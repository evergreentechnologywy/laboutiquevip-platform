import test from "node:test";
import assert from "node:assert/strict";
import { getProviderBySlugHandler } from "./providerPublic.js";

function makeReq(pathname = "/api/v1/providers/by-slug/rubyvega") {
  return {
    method: "GET",
    path: pathname,
    pathname,
    query: new URLSearchParams(),
    headers: {},
    ipAddress: "127.0.0.1",
    requestId: "test-req",
    rawBody: null,
    auth: { userId: null, roles: [] },
    body: undefined,
  };
}

test("getProviderBySlugHandler uses public profile select to avoid user_id hydration", async () => {
  let seenSelect: unknown = null;
  const prisma = {
    provider: {
      findFirst: async ({ select }: { select: unknown }) => {
        seenSelect = select;
        return {
          id: "7cfe5771-2c47-4c74-b8e0-f47e8f651c03",
          display_name: "Ruby Vega",
          verification_provider: "eros",
          verification_username: "rubyvega",
          verification_url: "https://www.eros.com/provider/12345-rubyvega.html",
          photos: ["/api/r2-photo/7cfe5771-2c47-4c74-b8e0-f47e8f651c03/000.jpg"],
          phone: "5551234567",
        };
      },
      findMany: async () => [],
    },
  };

  const res = await getProviderBySlugHandler(makeReq(), "rubyvega", { prisma });
  assert.equal(res.statusCode, 200);
  assert.equal((seenSelect as { phone?: boolean }).phone, true);
  assert.equal((seenSelect as { user_id?: boolean }).user_id, undefined);
  assert.equal((res.body as { phone?: string }).phone, "5551234567");
  assert.equal((res.body as { public_slug?: string }).public_slug, "rubyvega");
  assert.equal((res.body as { user_id?: string }).user_id, undefined);
});

test("getProviderBySlugHandler redacts phone for non-imported public profiles", async () => {
  const prisma = {
    provider: {
      findFirst: async () => ({
        id: "00000000-0000-4000-8000-000000000099",
        display_name: "Evergreen Model",
        verification_provider: "evergreen",
        verification_url: "https://example.com/model",
        photos: ["/api/r2-photo/00000000-0000-4000-8000-000000000099/000.jpg"],
        phone: "5559990000",
      }),
      findMany: async () => [],
    },
  };

  const res = await getProviderBySlugHandler(makeReq(), "evergreen-model", { prisma });
  assert.equal(res.statusCode, 200);
  assert.equal((res.body as { phone?: string }).phone, undefined);
});

test("getProviderBySlugHandler returns 404 when no public provider matches", async () => {
  const prisma = {
    provider: {
      findFirst: async () => null,
      findMany: async () => [],
    },
  };

  const res = await getProviderBySlugHandler(makeReq(), "missing-slug", { prisma });
  assert.equal(res.statusCode, 404);
});
