import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_STALE_GRACE_DAYS,
  catalogProviderDedupeKey,
  catalogStaleCutoff,
  isCatalogProviderStale,
  shouldSkipCatalogInsert,
} from "./catalogSyncPolicy.js";

test("catalogProviderDedupeKey prefers eros file id", () => {
  const key = catalogProviderDedupeKey({
    display_name: "Camila",
    location_city: "Miami",
    location_state: "FL",
    verification_url: "https://www.eros.com/florida/miami/files/999.htm",
  });
  assert.equal(key, "eros:999");
});

test("catalogProviderDedupeKey falls back to name+city+state", () => {
  const key = catalogProviderDedupeKey({
    display_name: "Camila Rose",
    location_city: "Miami",
    location_state: "FL",
    verification_url: "https://tryst.link/escort/camila-rose",
  });
  assert.equal(key, "name:camila rose|miami|fl");
});

test("shouldSkipCatalogInsert blocks same-city duplicate by verification file id", () => {
  const candidate = {
    display_name: "Other Name",
    location_city: "Miami",
    location_state: "FL",
    verification_url: "https://www.eros.com/florida/miami/files/42.htm",
  };
  const existing = {
    display_name: "Camila",
    location_city: "Miami Beach",
    location_state: "FL",
    verification_url: "https://www.eros.com/florida/miami/files/42.htm?x=1",
  };
  assert.equal(shouldSkipCatalogInsert(candidate, existing), true);
});

test("shouldSkipCatalogInsert blocks same display_name in same city", () => {
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

test("shouldSkipCatalogInsert allows same name in different city", () => {
  const candidate = {
    display_name: "Camila Rose",
    location_city: "Miami",
    location_state: "FL",
    verification_url: "https://tryst.link/escort/camila-miami",
  };
  const existing = {
    display_name: "Camila Rose",
    location_city: "Orlando",
    location_state: "FL",
    verification_url: "https://tryst.link/escort/camila-orlando",
  };
  assert.equal(shouldSkipCatalogInsert(candidate, existing), false);
});

test("isCatalogProviderStale respects 15-day grace", () => {
  const now = new Date("2026-07-09T12:00:00.000Z");
  const seen16DaysAgo = new Date(now.getTime() - (CATALOG_STALE_GRACE_DAYS + 1) * 24 * 60 * 60 * 1000);
  const seen10DaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

  assert.equal(isCatalogProviderStale(seen16DaysAgo, now), true);
  assert.equal(isCatalogProviderStale(seen10DaysAgo, now), false);
  assert.equal(isCatalogProviderStale(null, now), false);
});

test("catalogStaleCutoff is graceDays before now", () => {
  const now = new Date("2026-07-09T12:00:00.000Z");
  const cutoff = catalogStaleCutoff(now, 15);
  assert.equal(cutoff.toISOString(), "2026-06-24T12:00:00.000Z");
});
