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
  assert.equal(filters.where.AND.length, 4);
  assert.equal(filters.where.AND[0].NOT.OR.length, 13);
  assert.deepEqual(filters.where.AND.slice(1), [
    {
      tags: {
        some: {
          tag: {
            slug: "vip",
          },
        },
      },
    },
    {
      OR: [
        { citySlug: "new-york" },
        { availabilityBlocks: { some: { citySlug: "new-york" } } },
        { tours: { some: { citySlug: "new-york" } } },
      ],
    },
    {
      availabilityBlocks: {
        some: {
          isAvailable: true,
          endsAt: { gte: new Date("2026-08-01T00:00:00.000Z") },
          startsAt: { lte: new Date("2026-08-30T00:00:00.000Z") },
        },
      },
    },
  ]);
});

test("buildSearchModelFilters applies availableTo-only overlap filter", () => {
  const filters = buildSearchModelFilters({
    availableTo: "2026-10-05T00:00:00.000Z",
    page: 1,
    limit: 20,
  });

  assert.ok(Array.isArray(filters.where.AND));
  assert.equal(filters.where.AND.length, 2);
  assert.equal(filters.where.AND[0].NOT.OR.length, 13);
  assert.deepEqual(filters.where.AND[1], {
    availabilityBlocks: {
      some: {
        isAvailable: true,
        startsAt: { lte: new Date("2026-10-05T00:00:00.000Z") },
      },
    },
  });
});
