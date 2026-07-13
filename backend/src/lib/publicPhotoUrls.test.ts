import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicPhotoUrl, toPublicPhotoUrls } from "./publicPhotoUrls.js";

test("resolves R2 to relative path", () => {
  const url = resolvePublicPhotoUrl("https://www.laboutiquevip.net/api/r2-photo/abc/000.jpg");
  assert.equal(url, "/api/r2-photo/abc/000.jpg");
});

test("proxies eros and prefers large tryst", () => {
  assert.match(resolvePublicPhotoUrl("https://www.eros.com/i/1/profile/x.jpg", "p1") || "", /\/api\/eros-photo\?/);
  const tryst = resolvePublicPhotoUrl(
    "https://media-v2.tryst.a4cdn.org/profiles/a/photos/b/small.avif",
    "p1",
  );
  assert.match(tryst || "", /\/api\/tryst-photo\?/);
  assert.match(decodeURIComponent(tryst || ""), /\/large\.avif/);
});

test("orders R2 before proxies", () => {
  const out = toPublicPhotoUrls(
    [
      "https://media-v2.tryst.a4cdn.org/profiles/a/photos/b/small.avif",
      "/api/r2-photo/abc/000.jpg",
      "https://www.eros.com/i/1/profile/x.jpg",
    ],
    "abc",
  );
  assert.equal(out[0], "/api/r2-photo/abc/000.jpg");
  assert.match(out[1], /eros-photo/);
  assert.match(out[2], /tryst-photo/);
});
