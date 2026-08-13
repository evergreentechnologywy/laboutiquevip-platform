import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogFromRows,
  clearPublishedCatalogCache,
  findPublishedCity,
  findPublishedProfile,
  loadPublishedCatalog,
  profilesForCity,
  resolveLegacyCityListingRedirect,
  type PublishedCatalog,
} from "./publishedCatalog.js";
import { clearPublicPhotoProviderIdsCache } from "../routes/providerVisibility.js";

function reset(): void {
  clearPublishedCatalogCache();
  clearPublicPhotoProviderIdsCache();
}

function sampleProvider(
  id: string,
  displayName: string,
  city: string,
  state: string,
  username: string,
) {
  return {
    id,
    display_name: displayName,
    location_city: city,
    location_state: state,
    is_verified: true,
    updated_date: new Date("2026-01-15T00:00:00Z"),
    verification_username: username,
    verification_url: null,
  };
}

test("buildCatalogFromRows keeps only canonical cities and separate profile slugs", () => {
  const catalog = buildCatalogFromRows(
    [
      sampleProvider("1", "Provider Akron", "Akron", "OH", "provider-akron"),
      sampleProvider(
        "2",
        "Listing Legacy",
        "abby-somers-i-am-columbus",
        "OH",
        "abby-somers-i-am-columbus",
      ),
    ],
    [],
    12,
  );

  assert.equal(catalog.cities.length, 1);
  assert.equal(catalog.cities[0].slug, "akron");
  assert.equal(catalog.profiles.length, 2);
  assert.ok(catalog.profileSlugSet.has("abby-somers-i-am-columbus"));
  assert.ok(!catalog.citySlugSet.has("abby-somers-i-am-columbus"));
  assert.equal(catalog.stats.providers, 2);
  assert.equal(catalog.stats.cities, 1);
  assert.equal(catalog.stats.photos, 12);
});

test("resolveLegacyCityListingRedirect maps listing slugs off /city to /profile", () => {
  const catalog = buildCatalogFromRows(
    [sampleProvider("2", "Listing Legacy", "Columbus", "OH", "abby-somers-i-am-columbus")],
    [],
    0,
  );

  assert.equal(
    resolveLegacyCityListingRedirect("abby-somers-i-am-columbus", catalog),
    "/profile/abby-somers-i-am-columbus",
  );
  assert.equal(resolveLegacyCityListingRedirect("akron", catalog), null);
});

test("sitemap-sized catalog stats align with city and profile lists", () => {
  const catalog = buildCatalogFromRows(
    [
      sampleProvider("1", "Alpha", "Los Angeles", "CA", "alpha"),
      sampleProvider("2", "Beta", "Los Angeles", "CA", "beta"),
      sampleProvider("3", "Gamma", "San Diego", "CA", "gamma"),
    ],
    [],
    9,
  );

  assert.equal(catalog.stats.providers, catalog.profiles.length);
  assert.equal(catalog.stats.cities, catalog.cities.length);
  assert.equal(findPublishedCity("los-angeles", catalog)?.providerCount, 2);
  assert.equal(profilesForCity("los-angeles", catalog).length, 2);
  assert.ok(findPublishedProfile("alpha", catalog));
});

test("loadPublishedCatalog uses prisma loader and cache", async () => {
  reset();
  let calls = 0;
  const prisma = {
    provider: {
      findMany: async () => {
        calls++;
        return [sampleProvider("1", "Alpha", "Miami", "FL", "alpha")];
      },
    },
    providerProfile: { findMany: async () => [] },
    $queryRaw: async () => [{ total: BigInt(3) }],
  };

  const first = await loadPublishedCatalog(prisma);
  const second = await loadPublishedCatalog(prisma);
  assert.equal(first.stats.providers, 1);
  assert.equal(second.stats.providers, 1);
  assert.equal(calls, 1);
});
