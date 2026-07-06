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

test("publicProviderVisibilityWhere excludes stubs with empty photos and no verification", () => {
  const where = publicProviderVisibilityWhere();
  const andClause = where.AND as Record<string, unknown>[];
  const stubExclusion = andClause.find(
    (branch) =>
      typeof branch === "object" &&
      branch !== null &&
      "NOT" in branch &&
      JSON.stringify((branch as { NOT: unknown }).NOT) === JSON.stringify(buildEmptyPhotoStubExclusion()),
  );

  assert.ok(stubExclusion, "expected NOT stub exclusion in AND");
});

test("publicProviderVisibilityWhere keeps advertiser-owned profiles without photos", () => {
  const where = publicProviderVisibilityWhere();
  const sourceFilter = (where.AND as Record<string, unknown>[])[1] as {
    OR: Record<string, unknown>[];
  };

  assert.deepEqual(sourceFilter.OR, [
    { user_id: { not: null } },
    { verification_provider: { in: ["eros", "evergreen"] } },
  ]);
});
