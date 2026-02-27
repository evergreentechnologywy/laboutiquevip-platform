import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchModelFilters } from "./searchFilters.js";

test("buildSearchModelFilters constructs base published filter", () => {
  const filters = buildSearchModelFilters({
    page: 1,
    limit: 20,
  });

  assert.equal(filters.where.isPublished, true);
  assert.equal(filters.skip, 0);
  assert.equal(filters.take, 20);
});

test("buildSearchModelFilters includes city/tag/availability filters", () => {
  const filters = buildSearchModelFilters({
    city: "New York",
    tag: "vip",
    availableFrom: "2026-08-01T00:00:00.000Z",
    availableTo: "2026-08-30T00:00:00.000Z",
    verified: false,
    page: 3,
    limit: 15,
  });

  assert.equal(filters.where.isVerified, false);
  assert.equal(filters.skip, 30);
  assert.equal(filters.take, 15);
  assert.ok(Array.isArray(filters.where.AND));
});
