import assert from "node:assert/strict";
import test from "node:test";

import { getDisplayProfilePhotos } from "../../src/lib/profilePhotos.js";

test("model-site photos can use the provider identity in the hostname", () => {
  const provider = {
    id: "ruby",
    display_name: "Ruby Vega",
    verification_url: "https://rubyvega.site",
    photos: ["https://rubyvega.site/assets/photo_5005765537631505406_y-e0dc1387.jpg"],
  };

  assert.deepEqual(getDisplayProfilePhotos(provider, 8), provider.photos);
});

test("a different provider cannot inherit model-site photos", () => {
  const provider = {
    id: "camila",
    display_name: "CAMILA",
    verification_url: "https://camilavip.site",
    photos: ["https://rubyvega.site/assets/photo_5005765537631505406_y-e0dc1387.jpg"],
  };

  assert.deepEqual(getDisplayProfilePhotos(provider, 8), []);
});
