import test from "node:test";
import assert from "node:assert/strict";
import { effectiveLimit, formatCap, parseImportLimit, sliceToLimit } from "./import-limits.mjs";

test("parseImportLimit treats 0 as unlimited", () => {
  assert.equal(parseImportLimit("0"), 0);
  assert.equal(parseImportLimit("", 0), 0);
  assert.equal(parseImportLimit("50", 0), 50);
});

test("effectiveLimit and sliceToLimit honor unlimited", () => {
  assert.equal(effectiveLimit(0), Number.POSITIVE_INFINITY);
  assert.equal(sliceToLimit([1, 2, 3, 4], 0).length, 4);
  assert.deepEqual(sliceToLimit([1, 2, 3, 4], 2), [1, 2]);
});

test("formatCap shows unlimited for zero", () => {
  assert.equal(formatCap(0), "unlimited");
  assert.equal(formatCap(25), "25");
});
