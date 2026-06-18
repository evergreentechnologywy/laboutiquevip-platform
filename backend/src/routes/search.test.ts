import test from "node:test";
import assert from "node:assert/strict";
import { searchProvidersHandler } from "./search.js";

function makeReq(query: Record<string, string> = {}): any {
  return {
    method: "GET",
    path: "/api/v1/search/providers",
    pathname: "/api/v1/search/providers",
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
    makeReq({ premium: "true", verified: "true", limit: "6" }),
    { prisma },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers?.["cache-control"], "public, max-age=30, s-maxage=30, stale-while-revalidate=120");
  assert.equal(Array.isArray(seenFindManyArgs.where.AND), true);
  assert.equal(seenFindManyArgs.where.AND.length, 4);
  assert.equal(seenFindManyArgs.where.AND[0].status, "active");
  assert.equal(seenFindManyArgs.where.AND[0].is_profile_approved, true);
  assert.ok(seenFindManyArgs.where.AND[0].NOT);
  assert.ok(Array.isArray(seenFindManyArgs.where.AND[0].NOT.OR));
  assert.deepEqual(seenFindManyArgs.where.AND.slice(1), [
    { is_verified: true },
    { OR: [{ is_premium: true }, { ad_package: "elite" }] },
    { OR: [{ rate_hourly: null }, { rate_hourly: { gte: 0, lte: 2000 } }] },
  ]);
  assert.deepEqual(seenCountArgs.where, seenFindManyArgs.where);
});
