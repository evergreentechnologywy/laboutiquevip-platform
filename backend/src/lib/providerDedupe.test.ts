import test from "node:test";
import assert from "node:assert/strict";
import { dedupeProviders, providerDedupeKey } from "../lib/providerDedupe.js";

test("providerDedupeKey prefers eros file id over name+city", () => {
  const key = providerDedupeKey({
    display_name: "CAMILA",
    location_city: "New York City",
    location_state: "NY",
    verification_url: "https://www.eros.com/new_york/new_york/files/1234567.htm",
  });
  assert.equal(key, "eros:1234567");
});

test("dedupeProviders keeps highest-scored duplicate", () => {
  const winner = {
    id: "winner",
    display_name: "CAMILA",
    location_city: "New York City",
    location_state: "NY",
    verification_url: "https://www.eros.com/new_york/new_york/files/1234567.htm",
    status: "active",
    is_verified: true,
    is_premium: true,
    is_profile_approved: true,
    verification_provider: "eros",
    photos: ["a", "b", "c"],
    updated_date: "2026-01-01T00:00:00.000Z",
  };
  const loser = {
    ...winner,
    id: "loser",
    is_premium: false,
    photos: ["a"],
    updated_date: "2025-01-01T00:00:00.000Z",
  };

  const result = dedupeProviders([loser, winner]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "winner");
});
