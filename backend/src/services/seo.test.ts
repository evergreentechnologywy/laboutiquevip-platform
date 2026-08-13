import assert from "node:assert/strict";
import test from "node:test";
import { generateSitemapXml } from "./seo.js";
import { sitemapHandler } from "../routes/seo.js";
import { clearPublishedCatalogCache } from "../lib/publishedCatalog.js";
import { clearPublicPhotoProviderIdsCache } from "../routes/providerVisibility.js";
import type { ApiRequest } from "../types.js";

test("generateSitemapXml emits only city and profile paths", () => {
  const xml = generateSitemapXml(
    [{ path: "/city/akron-oh", lastModified: "2026-01-01T00:00:00.000Z" }],
    [{ path: "/profile/sample-one", lastModified: "2026-01-02T00:00:00.000Z" }],
  );

  assert.match(xml, /<loc>.*\/city\/akron-oh<\/loc>/);
  assert.match(xml, /<loc>.*\/profile\/sample-one<\/loc>/);
  assert.equal((xml.match(/<url>/g) ?? []).length, 2);
});

test("sitemapHandler counts match published catalog entries", async () => {
  clearPublishedCatalogCache();
  clearPublicPhotoProviderIdsCache();

  const prisma = {
    provider: {
      findMany: async () => [
        {
          id: "1",
          display_name: "Alpha",
          location_city: "Akron",
          location_state: "OH",
          is_verified: true,
          updated_date: new Date("2026-01-01"),
          verification_username: "alpha",
          verification_url: null,
        },
        {
          id: "2",
          display_name: "Beta",
          location_city: "Columbus",
          location_state: "OH",
          is_verified: false,
          updated_date: new Date("2026-01-02"),
          verification_username: "beta",
          verification_url: null,
        },
      ],
    },
    providerProfile: { findMany: async () => [] },
    $queryRaw: async () => [{ total: BigInt(2) }],
  };

  const req = {
    method: "GET",
    pathname: "/sitemap.xml",
    query: new URLSearchParams(),
    headers: {},
    body: null,
  } as unknown as ApiRequest;

  const res = await sitemapHandler(req, { prisma });
  const xml = String(res.rawBody);
  const urlCount = (xml.match(/<url>/g) ?? []).length;
  assert.equal(urlCount, 4); // 2 cities + 2 profiles
  assert.match(xml, /\/city\/akron-oh/);
  assert.match(xml, /\/city\/columbus-oh/);
  assert.match(xml, /\/profile\/alpha/);
  assert.match(xml, /\/profile\/beta/);
});
