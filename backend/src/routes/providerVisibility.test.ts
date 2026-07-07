import test from "node:test";
import assert from "node:assert/strict";
import { publicProviderVisibilityWhere } from "./providerVisibility.js";

test("publicProviderVisibilityWhere keeps free-tier listings visible with stale expiry", () => {
  const where = publicProviderVisibilityWhere();
  const packageVisibility = (where.AND as Record<string, unknown>[])[0] as {
    OR: Record<string, unknown>[];
  };

  assert.equal(packageVisibility.OR.length, 3);
  assert.deepEqual(packageVisibility.OR[0], { ad_package_expiry: null });
  assert.deepEqual(packageVisibility.OR[2], { ad_package: "none" });
  const expiryBranch = packageVisibility.OR[1] as { ad_package_expiry: { gte: string } };
  assert.ok(expiryBranch.ad_package_expiry?.gte);
  assert.ok(Number.isFinite(Date.parse(expiryBranch.ad_package_expiry.gte)));
});

test("publicProviderVisibilityWhere restricts catalog to imported sources", () => {
  const where = publicProviderVisibilityWhere();
  const sourceFilter = (where.AND as Record<string, unknown>[])[1] as {
    verification_provider: { in: string[] };
  };

  assert.deepEqual(sourceFilter.verification_provider.in.sort(), ["eros", "evergreen", "tryst"]);
});
