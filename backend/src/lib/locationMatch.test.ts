import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizePublicCity,
  isPlausiblePublicCityName,
  buildLocationFilter,
} from "./locationMatch.js";

test("isPlausiblePublicCityName rejects junk and bio fragments", () => {
  assert.equal(isPlausiblePublicCityName("Miami"), true);
  assert.equal(isPlausiblePublicCityName("New York"), true);
  assert.equal(isPlausiblePublicCityName("Unknown"), false);
  assert.equal(isPlausiblePublicCityName("Miami. I create a relaxed"), false);
  assert.equal(isPlausiblePublicCityName("Caters to men"), false);
});

test("canonicalizePublicCity strips City, ST duplicates", () => {
  const miami = canonicalizePublicCity("Miami, FL", "FL");
  assert.deepEqual(miami, { slug: "miami", name: "Miami" });

  const junk = canonicalizePublicCity("Miami. Travel", "FL");
  assert.equal(junk, null);

  const unknown = canonicalizePublicCity("Unknown", "AZ");
  assert.equal(unknown, null);
});

test("buildLocationFilter does not match state abbrev against location_city", () => {
  const filter = buildLocationFilter("CO") as { OR: Array<Record<string, unknown>> };
  assert.ok(filter?.OR?.length);
  for (const branch of filter.OR) {
    assert.equal(
      (branch as { location_city?: unknown }).location_city,
      undefined,
      "bare state query must not use location_city contains",
    );
  }
});

test("buildLocationFilter keeps city matchers for city names", () => {
  const filter = buildLocationFilter("Miami") as { OR: Array<Record<string, unknown>> };
  assert.ok(filter.OR.some((branch) => (branch as { location_city?: unknown }).location_city));
});
