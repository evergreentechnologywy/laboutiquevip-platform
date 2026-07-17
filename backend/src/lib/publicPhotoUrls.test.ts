import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicPhotoUrl, toPublicPhotoUrls, filterDominantTrystCluster } from "./publicPhotoUrls.js";

test("resolves R2 to relative path", () => {
  const url = resolvePublicPhotoUrl("https://www.laboutiquevip.net/api/r2-photo/abc/000.jpg");
  assert.equal(url, "/api/r2-photo/abc/000.jpg");
});

test("proxies eros and prefers large tryst", () => {
  assert.match(resolvePublicPhotoUrl("https://www.eros.com/i/1/profile/x.jpg", "p1") || "", /\/api\/eros-photo\?/);
  const tryst = resolvePublicPhotoUrl(
    "https://media-v2.tryst.a4cdn.org/profiles/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/b/small.avif",
    "p1",
  );
  assert.match(tryst || "", /\/api\/tryst-photo\?/);
  assert.match(decodeURIComponent(tryst || ""), /\/large\.avif/);
});

test("orders R2 before proxies", () => {
  const out = toPublicPhotoUrls(
    [
      "https://media-v2.tryst.a4cdn.org/profiles/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/b/small.avif",
      "/api/r2-photo/abc/000.jpg",
      "https://www.eros.com/i/1/profile/x.jpg",
    ],
    "abc",
  );
  assert.equal(out[0], "/api/r2-photo/abc/000.jpg");
  assert.match(out[1], /eros-photo/);
  assert.match(out[2], /tryst-photo/);
});

test("drops shark placeholders and foreign tryst clusters", () => {
  const out = toPublicPhotoUrls(
    [
      "https://discovery.tryst.a4cdn.org/packs/static/images/sharks_512-28a0b5cf8c2cf1d4bb5d.png",
      "https://media-v2.tryst.a4cdn.org/profiles/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/p1/thumb.jpeg",
      "https://media-v2.tryst.a4cdn.org/profiles/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/p2/small.jpeg",
      "https://media-v2.tryst.a4cdn.org/profiles/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/photos/p3/thumb.jpeg",
      { url: "https://www.laboutiquevip.net/api/r2-photo/abc/000.jpg" },
    ],
    "abc",
    8,
  );
  assert.equal(out[0], "/api/r2-photo/abc/000.jpg");
  assert.ok(!out.some((u) => u.includes("sharks") || u.includes("bbbbbbbb")));
  assert.ok(out.some((u) => u.includes("tryst-photo")));
});

test("filterDominantTrystCluster keeps majority profile", () => {
  const urls = [
    "https://media-v2.tryst.a4cdn.org/profiles/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/1/small.jpeg",
    "https://media-v2.tryst.a4cdn.org/profiles/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/photos/2/small.jpeg",
    "https://media-v2.tryst.a4cdn.org/profiles/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/photos/3/small.jpeg",
  ];
  const out = filterDominantTrystCluster(urls);
  assert.equal(out.length, 2);
  assert.ok(out.every((u) => u.includes("aaaaaaaa")));
});
