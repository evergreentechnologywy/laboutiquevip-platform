import assert from "node:assert/strict";
import test from "node:test";
import { publicCityPageHandler, publicProfilePageHandler } from "./publicDirectory.js";
import { clearPublishedCatalogCache } from "../lib/publishedCatalog.js";
import { clearPublicPhotoProviderIdsCache } from "./providerVisibility.js";
import type { ApiRequest } from "../types.js";

function reset(): void {
  clearPublishedCatalogCache();
  clearPublicPhotoProviderIdsCache();
}

function req(pathname: string, method = "GET"): ApiRequest {
  return {
    method,
    pathname,
    query: new URLSearchParams(),
    headers: {},
    body: null,
  } as unknown as ApiRequest;
}

function mockPrisma() {
  return {
    provider: {
      findMany: async () => [
        {
          id: "1",
          display_name: "Sample One",
          location_city: "Akron",
          location_state: "OH",
          is_verified: true,
          updated_date: new Date("2026-01-01"),
          verification_username: "sample-one",
          verification_url: null,
        },
        {
          id: "2",
          display_name: "Legacy Listing",
          location_city: "abby-somers-i-am-columbus",
          location_state: "OH",
          is_verified: false,
          updated_date: new Date("2026-01-02"),
          verification_username: "abby-somers-i-am-columbus",
          verification_url: null,
        },
      ],
    },
    providerProfile: { findMany: async () => [] },
    $queryRaw: async () => [{ total: BigInt(4) }],
  };
}

test("publicCityPageHandler returns HTML for real city slug", async () => {
  reset();
  const res = await publicCityPageHandler(req("/city/akron-oh"), "akron-oh", { prisma: mockPrisma() });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers?.["content-type"]), /text\/html/);
  assert.match(String(res.rawBody), /<h1>Akron, OH<\/h1>/);
});

test("publicCityPageHandler returns HTML 404 for unknown city slug", async () => {
  reset();
  const res = await publicCityPageHandler(req("/city/unknown-city"), "unknown-city", { prisma: mockPrisma() });
  assert.equal(res.statusCode, 404);
  assert.match(String(res.headers?.["content-type"]), /text\/html/);
  assert.match(String(res.rawBody), /Page not found/);
});

test("publicCityPageHandler accepts legacy city slug without state suffix", async () => {
  reset();
  const res = await publicCityPageHandler(req("/city/akron"), "akron", { prisma: mockPrisma() });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.rawBody), /<h1>Akron, OH<\/h1>/);
});

test("publicCityPageHandler redirects legacy listing slug to profile URL", async () => {
  reset();
  const res = await publicCityPageHandler(
    req("/city/abby-somers-i-am-columbus"),
    "abby-somers-i-am-columbus",
    { prisma: mockPrisma() },
  );
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers?.location, "/profile/abby-somers-i-am-columbus");
});

test("publicProfilePageHandler returns HTML for profile slug", async () => {
  reset();
  const res = await publicProfilePageHandler(req("/profile/sample-one"), "sample-one", {
    prisma: mockPrisma(),
  });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.rawBody), /data-page="profile"/);
  assert.match(String(res.rawBody), /Sample One/);
});
