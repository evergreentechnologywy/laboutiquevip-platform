import assert from "node:assert/strict";
import test from "node:test";

import { dedupeProvidersForDisplay } from "../../src/lib/providerPresentation.js";

test("featured display keeps only the first city listing for the same model", () => {
  const providers = [
    { id: "statewide", display_name: "Angelina Pellegrini", location_city: "Statewide" },
    { id: "miami", display_name: "Angelina  Pellegrini", location_city: "Miami" },
    { id: "other", display_name: "CAMILA", location_city: "Tampa" },
  ];

  assert.deepEqual(
    dedupeProvidersForDisplay(providers).map((provider) => provider.id),
    ["statewide", "other"],
  );
});

test("featured display preserves unnamed records by id", () => {
  const providers = [{ id: "one" }, { id: "two" }, { id: "one" }];
  assert.deepEqual(
    dedupeProvidersForDisplay(providers).map((provider) => provider.id),
    ["one", "two"],
  );
});

test("featured display prefers the duplicate with a durable R2 gallery", () => {
  const result = dedupeProvidersForDisplay([
    { id: "external", display_name: "Angelina", photos: ["https://example.com/photo.jpg"] },
    {
      id: "r2",
      display_name: "Angelina",
      photos: [
        "/api/r2-photo/model/000.jpg",
        "/api/r2-photo/model/001.jpg",
      ],
    },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "r2");
});
