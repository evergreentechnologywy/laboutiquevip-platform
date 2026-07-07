import test from "node:test";
import assert from "node:assert/strict";
import { searchProvidersHandler, searchLocationsHandler, clearSearchLocationsCache } from "./search.js";

function makeReq(
  pathname: string,
  query: Record<string, string> = {},
): any {
  return {
    method: "GET",
    path: pathname,
    pathname,
    query: new URLSearchParams(query),
    headers: {},
    ipAddress: "127.0.0.1",
    requestId: "req-search-1",
    rawBody: null,
    auth: { userId: null, roles: [] },
  };
}

test("searchProvidersHandler applies public guardrails and cache headers", async () => {
  let seenFindManyArgs: any = null;
  let seenCountArgs: any = null;

  const prisma = {
    $queryRaw: async () => [{ id: "provider-with-photos" }],
    provider: {
      findMany: async (args: any) => {
        seenFindManyArgs = args;
        return [];
      },
      count: async (args: any) => {
        seenCountArgs = args;
        return 0;
      },
      aggregate: async (_args: any) => {
        return { _max: { rate_hourly: null } };
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };

  const res = await searchProvidersHandler(
    makeReq("/api/v1/search/providers", { premium: "true", verified: "true", limit: "6" }),
    { prisma },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers?.["cache-control"], "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
  assert.equal(Array.isArray(seenFindManyArgs.where.AND), true);
  assert.equal(seenFindManyArgs.where.AND.length, 5);
  assert.equal(seenFindManyArgs.where.AND[0].status, "active");
  assert.equal(seenFindManyArgs.where.AND[0].is_profile_approved, true);
  assert.ok(seenFindManyArgs.where.AND[0].NOT);
  assert.ok(Array.isArray(seenFindManyArgs.where.AND[0].NOT.OR));
  assert.deepEqual(seenFindManyArgs.where.AND[1], {
    id: { in: ["provider-with-photos"] },
  });
  assert.deepEqual(seenFindManyArgs.where.AND.slice(2), [
    { is_verified: true },
    { OR: [{ is_premium: true }, { ad_package: "elite" }] },
    { OR: [{ rate_hourly: null }, { rate_hourly: { gte: 0, lte: 2000 } }] },
  ]);
  assert.deepEqual(seenCountArgs.where, seenFindManyArgs.where);
});

test("searchLocationsHandler skips invalid state rows from bad imports", async () => {
  clearSearchLocationsCache();
  const prisma = {
    $queryRaw: async () => [{ id: "p1" }],
    provider: {
      findMany: async () => [
        { location_state: "FL", location_city: "Miami" },
        {
          location_state: "AND VERY EASY TO TEMPT ONTO A PLANE",
          location_city: "London",
        },
        { location_state: "ZZ", location_city: "Nowhere" },
      ],
    },
  };

  const res = await searchLocationsHandler(
    makeReq("/api/v1/search/locations"),
    { prisma },
  );

  assert.equal(res.statusCode, 200);
  const body = res.body as { states: Array<{ code: string }> };
  assert.equal(body.states.length, 1);
  assert.equal(body.states[0].code, "FL");
});

test("searchLocationsHandler returns hierarchical states with cities", async () => {
  clearSearchLocationsCache();
  const prisma = {
    $queryRaw: async () => [{ id: "p1" }, { id: "p2" }],
    provider: {
      findMany: async () => [
        { location_state: "FL", location_city: "Miami" },
        { location_state: "FL", location_city: "Miami" },
        { location_state: "FL", location_city: "Tampa" },
        { location_state: "TX", location_city: "Dallas" },
      ],
    },
  };

  const res = await searchLocationsHandler(
    makeReq("/api/v1/search/locations"),
    { prisma },
  );

  assert.equal(res.statusCode, 200);
  const body = res.body as {
    states: Array<{ code: string; count: number; cities: Array<{ slug: string; count: number }> }>;
  };
  assert.ok(Array.isArray(body.states));
  assert.equal(body.states.length, 2);

  const florida = body.states.find((s) => s.code === "FL");
  assert.ok(florida);
  assert.equal(florida.count, 3);
  assert.equal(florida.cities.length, 2);
  const miami = florida.cities.find((c) => c.slug === "miami");
  assert.equal(miami?.count, 2);
});
