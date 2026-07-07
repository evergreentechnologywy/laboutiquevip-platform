import test from "node:test";
import assert from "node:assert/strict";
import {
  hasP411Badge,
  hasPublicVerificationBadge,
  hasReviewBadge,
  publicVerificationBadgeWhere,
} from "./verificationBadges.js";

test("hasPublicVerificationBadge accepts P411 or review URLs", () => {
  assert.equal(hasPublicVerificationBadge({ p411_url: "https://www.preferred411.com/P12345" }), true);
  assert.equal(hasPublicVerificationBadge({ ter_url: "https://www.theeroticreview.com/x" }), true);
  assert.equal(hasPublicVerificationBadge({ verification_provider: "evergreen" }), true);
  assert.equal(hasPublicVerificationBadge({ verification_provider: "eros" }), false);
});

test("publicVerificationBadgeWhere includes evergreen exempt branch", () => {
  const where = publicVerificationBadgeWhere();
  assert.ok(where);
  const branches = (where as { OR: Record<string, unknown>[] }).OR;
  assert.ok(branches.some((row) => row.verification_provider === "evergreen"));
  assert.ok(branches.some((row) => row.p411_url && (row.p411_url as { not: null }).not === null));
});

test("badge helpers", () => {
  assert.equal(hasP411Badge({ p411_verified_at: new Date() }), true);
  assert.equal(hasP411Badge({ p411_url: "https://example.com" }), true);
  assert.equal(hasReviewBadge({ pd_url: "https://privatedelights.ch/x" }), true);
});
