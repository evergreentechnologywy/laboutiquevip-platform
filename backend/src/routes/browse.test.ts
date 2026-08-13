import assert from "node:assert/strict";
import test from "node:test";
import {
  browseStatesHandler,
  browseStateCitiesHandler,
  statsHandler,
  clearBrowseCaches,
} from "./browse.js";
import { clearPublicPhotoProviderIdsCache } from "./providerVisibility.js";
import type { ApiRequest } from "../types.js";

function resetCaches(): void {
  clearBrowseCaches();
  clearPublicPhotoProviderIdsCache();
}

function req(method = "GET"): ApiRequest {
  return { method, pathname: "/api/v1/browse/states", query: new URLSearchParams(), headers: {}, body: null } as unknown as ApiRequest;
}

function mockPrisma(rows: any[], photoTotal = 0) {
  return {
    provider: {
      findMany: async ({ select }: any) => rows.map((r) => ({
        id: r.id,
        display_name: r.display_name,
        location_state: r.location_state,
        location_city: r.location_city,
        is_verified: r.is_verified,
        updated_date: r.updated_date,
        verification_username: r.verification_username ?? r.id,
        verification_url: r.verification_url ?? null,
      })),
    },
    providerProfile: { findMany: async () => [] },
    $queryRaw: async (q: any, ...args: any[]) => {
      // photo-ID loader query selects ids; stats photo sum selects a total
      if (Array.isArray(q) && q.join(" ").includes('SELECT id')) return rows.map((r) => ({ id: r.id }));
      return [{ total: BigInt(photoTotal) }];
    },
  };
}

const ROWS = [
  { id: "1", display_name: "Provider A", location_state: "California", location_city: "Los Angeles", is_verified: true, verification_username: "provider-a" },
  { id: "2", display_name: "Provider B", location_state: "CA", location_city: "los angeles", is_verified: false, verification_username: "provider-b" },
  { id: "3", display_name: "Provider C", location_state: "California", location_city: "San Diego", is_verified: true, verification_username: "provider-c" },
  { id: "4", display_name: "Provider D", location_state: "New York", location_city: "New York", is_verified: true, verification_username: "provider-d" },
  { id: "5", display_name: "Provider E", location_state: "Texas", location_city: "Houston", is_verified: false, verification_username: "provider-e" },
  { id: "6", display_name: "Provider F", location_state: "Atlantis", location_city: "Nowhere", is_verified: false, verification_username: "provider-f" }, // invalid state, dropped
];

test("browseStatesHandler groups states by region with counts", async () => {
  resetCaches();
  const res = await browseStatesHandler(req(), { prisma: mockPrisma(ROWS) });
  assert.equal(res.statusCode, 200);
  const body = res.body as any;
  assert.ok(Array.isArray(body.regions));
  const west = body.regions.find((r: any) => r.region === "West");
  const ca = west.states.find((s: any) => s.code === "CA");
  assert.equal(ca.providerCount, 3);
  assert.equal(ca.cityCount, 2);
  assert.equal(body.totals.providers, 5); // invalid state dropped from browse aggregation
  assert.equal(body.totals.states, 3);
});

test("browseStatesHandler serves cache on second call", async () => {
  resetCaches();
  const prisma = mockPrisma(ROWS);
  await browseStatesHandler(req(), { prisma });
  let called = 0;
  const prisma2 = { provider: { findMany: async () => { called++; return []; } }, $queryRaw: async () => [{ total: 0n }] };
  const res = await browseStatesHandler(req(), { prisma: prisma2 });
  assert.equal(res.statusCode, 200);
  assert.equal(called, 0); // cache hit, no DB
});

test("browseStateCitiesHandler returns sorted cities with verified counts", async () => {
  resetCaches();
  const res = await browseStateCitiesHandler(req(), "california", { prisma: mockPrisma(ROWS) });
  assert.equal(res.statusCode, 200);
  const body = res.body as any;
  assert.equal(body.state.code, "CA");
  assert.equal(body.cities[0].name.toLowerCase().includes("los angeles"), true);
  assert.equal(body.cities[0].providerCount, 2);
  assert.equal(body.cities[0].verifiedCount, 1);
  assert.equal(body.totals.providers, 3);
});

test("browseStateCitiesHandler 404s on invalid state", async () => {
  resetCaches();
  const res = await browseStateCitiesHandler(req(), "atlantis", { prisma: mockPrisma(ROWS) });
  assert.equal(res.statusCode, 404);
});

test("statsHandler returns totals incl photos sum", async () => {
  resetCaches();
  const res = await statsHandler(req(), { prisma: mockPrisma(ROWS, 42) });
  assert.equal(res.statusCode, 200);
  const body = res.body as any;
  assert.equal(body.providers, 6); // published profile count matches catalog rows
  assert.equal(body.states, 3);
  assert.equal(typeof body.cities, "number");
  assert.equal(body.photos, 42);
});

test("handlers reject non-GET", async () => {
  resetCaches();
  const res = await statsHandler(req("POST"), { prisma: mockPrisma(ROWS) });
  assert.equal(res.statusCode, 405);
});
