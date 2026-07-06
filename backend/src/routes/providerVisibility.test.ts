import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmptyPhotoStubExclusion,
  publicProviderVisibilityWhere,
} from "./providerVisibility.js";

test("publicProviderVisibilityWhere keeps free-tier listings visible with stale expiry", () => {
  const where = publicProviderVisibilityWhere();
  const packageVisibility = (where.AND as Record<string, unknown>[])[0] as {
    OR: Record<string, unknown>[];
  };

  assert.deepEqual(packageVisibility.OR, [
    { ad_package_expiry: null },
    { ad_package_expiry: { gte: new Date().toISOString() } },
    { ad_package: "none" },
  ]);
});

test("publicProviderVisibilityWhere hides photo-less stubs without verification", () => {
  const where = publicProviderVisibilityWhere();
  const stubGuard = (where.AND as Record<string, unknown>[])[2];

  assert.deepEqual(stubGuard, { NOT: buildEmptyPhotoStubExclusion() });
});

test("buildEmptyPhotoStubExclusion targets unverified import stubs", () => {
  const exclusion = buildEmptyPhotoStubExclusion();
  const andClause = exclusion.AND as Record<string, unknown>[];

  assert.deepEqual(andClause[0], { verification_url: null });
  assert.deepEqual(andClause[1], { verification_provider: null });
});

test("publicProviderVisibilityWhere keeps eros and evergreen scraped listings", () => {
  const where = publicProviderVisibilityWhere();
  const sourceFilter = (where.AND as Record<string, unknown>[])[1] as {
    OR: Record<string, unknown>[];
  };

  assert.deepEqual(sourceFilter.OR, [
    { user_id: { not: null } },
    { verification_provider: { in: ["eros", "evergreen"] } },
  ]);
});
