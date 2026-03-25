import test from "node:test";
import assert from "node:assert/strict";
import { healthHandler } from "./health.js";

test("healthHandler is static and non-cacheable", () => {
  const res = healthHandler();

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers?.["cache-control"], "no-store");
  assert.deepEqual(res.body, {
    ok: true,
    service: "trystlike-backend",
    phase: "0",
  });
});
