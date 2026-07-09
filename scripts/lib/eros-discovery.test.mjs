import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
