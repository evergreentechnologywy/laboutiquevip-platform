import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedR2ObjectKey, resolveR2PhotoKey } from "./r2-photo-proxy.js";

test("resolveR2PhotoKey maps legacy uuid paths into provider namespace", () => {
  const resolved = resolveR2PhotoKey("/api/r2-photo/7cfe5771-2c47-4c74-b8e0-f47e8f651c03/photo.jpg");
  assert.ok(resolved);
  assert.equal(resolved?.legacy, true);
  assert.equal(resolved?.key, "laboutiquevip/providers/7cfe5771-2c47-4c74-b8e0-f47e8f651c03/photo.jpg");
});

test("isAllowedR2ObjectKey rejects traversal and out-of-namespace keys", () => {
  assert.equal(isAllowedR2ObjectKey("../secrets.env", false), false);
  assert.equal(isAllowedR2ObjectKey("laboutiquevip/other/file.jpg", false), false);
  assert.equal(isAllowedR2ObjectKey("laboutiquevip/providers/../../etc/passwd", false), false);
  assert.equal(
    isAllowedR2ObjectKey("laboutiquevip/providers/7cfe5771-2c47-4c74-b8e0-f47e8f651c03/photo.jpg", true),
    true,
  );
  assert.equal(
    isAllowedR2ObjectKey("laboutiquevip/providers/7cfe5771-2c47-4c74-b8e0-f47e8f651c03/photo.jpg", false),
    true,
  );
});
