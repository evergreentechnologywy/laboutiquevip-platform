import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicPhotoVisibilityRequirement,
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

test("publicProviderVisibilityWhere requires photo, verification, or advertiser account", () => {
  const where = publicProviderVisibilityWhere();
  const photoVisibility = (where.AND as Record<string, unknown>[])[2];

  assert.deepEqual(photoVisibility, buildPublicPhotoVisibilityRequirement());
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
