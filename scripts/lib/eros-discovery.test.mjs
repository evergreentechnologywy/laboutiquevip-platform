import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hubKey, matchTop5CityToHub, mergeHubCatalog } from "./eros-hub-resolve.mjs";

// Minimal mirrors of import-eros hub helpers (keep in sync with scripts/import-eros.mjs)
function hubKeyForUrl(url) {
  const m = String(url).toLowerCase().match(
    /https?:\/\/(?:www|trans|massage)\.eros\.com\/([a-z0-9_-]+)(?:\/([a-z0-9_-]+))?\//i,
  );
  if (!m) return null;
  const state = m[1];
  let city = m[2] ?? state;
  if (city === "files" || city === "sections") city = state;
  return `${state}/${city}`;
}

function urlBelongsToHub(url, hub) {
  const u = String(url).toLowerCase();
  if (hub.state === hub.city) {
    return (
      u.includes(`/${hub.state}/`) &&
      !/\/(privacy|terms|about|contact|disclaimer|report)/i.test(u)
    );
  }
  return u.includes(`/${hub.state}/${hub.city}/`);
}

describe("eros discovery hub matching", () => {
  it("maps profile URLs to hub keys", () => {
    assert.equal(
      hubKeyForUrl("https://www.eros.com/florida/miami/files/123.htm"),
      "florida/miami",
    );
    assert.equal(
      hubKeyForUrl("https://trans.eros.com/carolinas/charlotte/files/99.htm"),
      "carolinas/charlotte",
    );
  });

  it("filters sitemap profiles per city hub", () => {
    const hub = { state: "florida", city: "miami" };
    assert.ok(urlBelongsToHub("https://www.eros.com/florida/miami/files/1.htm", hub));
    assert.ok(!urlBelongsToHub("https://www.eros.com/nevada/las_vegas/files/1.htm", hub));
  });

  it("includes all sub-cities for state-wide hubs", () => {
    const hub = { state: "carolinas", city: "carolinas" };
    assert.ok(urlBelongsToHub("https://www.eros.com/carolinas/charlotte/files/1.htm", hub));
    assert.ok(urlBelongsToHub("https://www.eros.com/carolinas/carolinas/files/1.htm", hub));
  });
});

describe("eros top-5 city hub resolution", () => {
  const sitemapHubs = [
    { state: "florida", city: "miami" },
    { state: "carolinas", city: "charlotte" },
    { state: "new_york", city: "new_york" },
    { state: "nevada", city: "las_vegas" },
    { state: "texas", city: "dallas" },
  ];

  it("matches Census city names to Eros hub slugs", () => {
    assert.deepEqual(matchTop5CityToHub("Miami", "FL", sitemapHubs), {
      state: "florida",
      city: "miami",
    });
    assert.deepEqual(matchTop5CityToHub("Charlotte", "NC", sitemapHubs), {
      state: "carolinas",
      city: "charlotte",
    });
    assert.deepEqual(matchTop5CityToHub("Las Vegas", "NV", sitemapHubs), {
      state: "nevada",
      city: "las_vegas",
    });
  });

  it("merges sitemap hubs with top-5 priority flags without duplicating keys", () => {
    const { hubs, top5Matched } = mergeHubCatalog(sitemapHubs, { includeTop5: true });
    assert.equal(hubs.length, sitemapHubs.length);
    assert.ok(top5Matched >= 3);
    const miami = hubs.find((h) => hubKey(h) === "florida/miami");
    assert.ok(miami?.priority);
    assert.ok(miami?.sources.includes("sitemap"));
    assert.ok(miami?.sources.includes("top5"));
  });
});
