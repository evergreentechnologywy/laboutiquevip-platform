import test from "node:test";
import assert from "node:assert/strict";
import { catalogIngestHandler, catalogSourcesHandler } from "./catalogIngest.js";

function makeRequest(overrides: Record<string, unknown> = {}): any {
  return {
    method: "POST",
    path: "/api/v1/catalog/ingest",
    pathname: "/api/v1/catalog/ingest",
    query: new URLSearchParams(),
    headers: {},
    ipAddress: "127.0.0.1",
    requestId: "req-catalog-1",
    rawBody: null,
    auth: { userId: "catalog-service", roles: ["service"] },
    body: {},
    ...overrides,
  };
}

test("catalogSourcesHandler denies non-service roles", async () => {
  const response = await catalogSourcesHandler(
    makeRequest({ auth: { userId: "u1", roles: ["member"] } }),
    {},
  );
  assert.equal(response.statusCode, 403);
});

test("catalogSourcesHandler lists eros+tryst+evergreen", async () => {
  const response = await catalogSourcesHandler(makeRequest({ method: "GET" }), {});
  assert.equal(response.statusCode, 200);
  const body = response.body as any;
  assert.deepEqual(body.allowed_sources, ["eros", "tryst", "evergreen"]);
  assert.deepEqual(body.catalog_sync_sources, ["eros", "tryst"]);
  assert.deepEqual(body.rejected_sources, ["ultragfe"]);
});

test("catalogIngestHandler rejects ultragfe source", async () => {
  const response = await catalogIngestHandler(
    makeRequest({
      body: {
        source: "ultragfe",
        providers: [
          {
            display_name: "No",
            verification_url: "https://example.com/x",
          },
        ],
      },
    }),
    { prisma: {} },
  );
  assert.equal(response.statusCode, 400);
});

test("catalogIngestHandler dry-run creates", async () => {
  const prisma = {
    provider: {
      findFirst: async () => null,
      create: async () => {
        throw new Error("should not create on dry-run");
      },
      update: async () => {
        throw new Error("should not update on dry-run");
      },
    },
  };

  const response = await catalogIngestHandler(
    makeRequest({
      body: {
        source: "eros",
        dry_run: true,
        providers: [
          {
            display_name: "Ada",
            verification_url: "https://www.eros.com/ad/123",
            location_city: "Chicago",
            location_state: "IL",
            photos: ["https://i.eros.com/a.jpg"],
          },
        ],
      },
    }),
    { prisma },
  );

  assert.equal(response.statusCode, 200);
  const body = response.body as any;
  assert.equal(body.ok, true);
  assert.equal(body.counts.created, 1);
  assert.equal(body.results[0].action, "would_create");
});

test("catalogIngestHandler updates existing row", async () => {
  const prisma = {
    provider: {
      findFirst: async () => ({
        id: "p1",
        photos: ["https://i.eros.com/old.jpg"],
        location_country: "US",
      }),
      update: async ({ data }: any) => ({ id: "p1", ...data }),
      create: async () => {
        throw new Error("should update");
      },
    },
  };

  const response = await catalogIngestHandler(
    makeRequest({
      body: {
        source: "tryst",
        providers: [
          {
            display_name: "Bea",
            verification_url: "https://tryst.link/escort/bea",
            location_city: "Miami",
            location_state: "FL",
            photos: ["https://media-v.tryst.link/new.jpg"],
          },
        ],
      },
    }),
    { prisma },
  );

  assert.equal(response.statusCode, 201);
  const body = response.body as any;
  assert.equal(body.counts.updated, 1);
  assert.equal(body.results[0].action, "updated");
  assert.equal(body.results[0].id, "p1");
});

test("catalogIngestHandler creates evergreen elite row with calendar city", async () => {
  let createdData: any = null;
  const prisma = {
    provider: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdData = data;
        return { id: "eg-1", ...data };
      },
      update: async () => {
        throw new Error("should create");
      },
    },
  };

  const response = await catalogIngestHandler(
    makeRequest({
      body: {
        source: "evergreen",
        providers: [
          {
            display_name: "Sofia",
            verification_url: "https://sofia.example.site",
            location_city: "Memphis",
            location_state: "TN",
            photos: ["https://cuentas.evergreentech.site/calendar/sofia.jpg"],
          },
        ],
      },
    }),
    { prisma },
  );

  assert.equal(response.statusCode, 201);
  const body = response.body as any;
  assert.equal(body.counts.created, 1);
  assert.equal(createdData?.ad_package, "elite");
  assert.equal(createdData?.location_city, "Memphis");
  assert.equal(createdData?.location_state, "TN");
});
