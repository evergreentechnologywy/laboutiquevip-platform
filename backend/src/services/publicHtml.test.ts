import assert from "node:assert/strict";
import test from "node:test";
import { renderCityPageHtml, renderProfilePageHtml } from "./publicHtml.js";

test("renderCityPageHtml includes crawler-visible content markers", () => {
  const html = renderCityPageHtml(
    {
      slug: "akron",
      citySlug: "akron",
      name: "Akron",
      stateCode: "OH",
      stateName: "Ohio",
      providerCount: 3,
      verifiedCount: 2,
      lastUpdatedAt: new Date("2026-01-01"),
    },
    [
      {
        slug: "sample-one",
        displayName: "Sample One",
        citySlug: "akron",
        cityName: "Akron",
        stateCode: "OH",
        updatedAt: new Date("2026-01-01"),
      },
    ],
  );

  assert.match(html, /<h1>Akron, OH<\/h1>/);
  assert.match(html, /data-page="city"/);
  assert.match(html, /id="root"/);
  assert.match(html, /lbv-public-directory/);
  assert.match(html, /\/profile\/sample-one/);
});

test("renderProfilePageHtml includes profile slug metadata", () => {
  const html = renderProfilePageHtml({
    slug: "sample-one",
    displayName: "Sample One",
    citySlug: "akron",
    cityName: "Akron",
    stateCode: "OH",
    updatedAt: new Date("2026-01-01"),
  });

  assert.match(html, /<h1>Sample One<\/h1>/);
  assert.match(html, /data-page="profile"/);
  assert.match(html, /data-profile-slug="sample-one"/);
});
