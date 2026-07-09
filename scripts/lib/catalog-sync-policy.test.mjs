import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_STALE_GRACE_DAYS,
  catalogProviderDedupeKey,
  catalogStaleCutoff,
  isCatalogProviderStale,
  shouldSkipCatalogInsert,
} from "./catalog-sync-policy.mjs";

test("catalogProviderDedupeKey prefers eros file id", () => {
  const key = catalogProviderDedupeKey({
    display_name: "Camila",
    location_city: "Miami",
    location_state: "FL",
    verification_url: "https://www.eros.com/florida/miami/files/999.htm",
  });
  assert.equal(key, "eros:999");
});

test("shouldSkipCatalogInsert blocks same name in same city", () => {
  const candidate = {
    display_name: "Camila-Rose!",
    location_city: "Miami",
    location_state: "FL",
    verification_url: "https://tryst.link/escort/camila-rose-2",
  };
  const existing = {
    display_name: "Camila Rose",
    location_city: "Miami",
    location_state: "FL",
    verification_url: "https://tryst.link/escort/camila-rose",
  };
  assert.equal(shouldSkipCatalogInsert(candidate, existing), true);
});

test("isCatalogProviderStale respects grace window", () => {
  const now = new Date("2026-07-09T12:00:00.000Z");
  const seen16DaysAgo = new Date(now.getTime() - (CATALOG_STALE_GRACE_DAYS + 1) * 24 * 60 * 60 * 1000);
  assert.equal(isCatalogProviderStale(seen16DaysAgo, now), true);
  assert.equal(isCatalogProviderStale(null, now), false);
});

test("catalogStaleCutoff", () => {
  const now = new Date("2026-07-09T12:00:00.000Z");
  assert.equal(catalogStaleCutoff(now, 15).toISOString(), "2026-06-24T12:00:00.000Z");
});
