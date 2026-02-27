import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarUpdateSchema,
  modelRegistrationSchema,
  searchModelsQuerySchema,
  tourCreateSchema,
} from "./models.js";

test("model registration validation accepts a valid payload", () => {
  const payload = modelRegistrationSchema.parse({
    displayName: "Ava Lane",
    city: "Miami",
    bio: "Independent model offering companionship and dinner dates.",
    services: ["dinner", "events"],
    rates: { currency: "USD", hourly: 450 },
    contactPreferences: { telegram: "ava_lane" },
    tags: ["vip", "travel"],
    isPublished: true,
  });

  assert.equal(payload.displayName, "Ava Lane");
  assert.deepEqual(payload.tags, ["vip", "travel"]);
});

test("tour validation rejects inverted range", () => {
  const result = tourCreateSchema.safeParse({
    city: "Chicago",
    startsAt: "2026-05-10T00:00:00.000Z",
    endsAt: "2026-05-01T00:00:00.000Z",
  });

  assert.equal(result.success, false);
});

test("calendar update rejects malformed datetime", () => {
  const result = calendarUpdateSchema.safeParse({
    blocks: [{ city: "Austin", startsAt: "invalid", endsAt: "2026-06-10T00:00:00.000Z" }],
  });

  assert.equal(result.success, false);
});

test("search query schema parses filters", () => {
  const parsed = searchModelsQuerySchema.parse({
    city: "Los Angeles",
    verified: "true",
    tag: "elite",
    available_from: "2026-04-01T00:00:00.000Z",
    available_to: "2026-04-30T23:59:59.000Z",
    page: "2",
    limit: "10",
  });

  assert.equal(parsed.city, "Los Angeles");
  assert.equal(parsed.verified, true);
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 10);
});
