import test from "node:test";
import assert from "node:assert/strict";
import { getPackageLifecycleDisplay } from "./packageLifecycle.js";

test("getPackageLifecycleDisplay keeps purchased package expiration visible", () => {
  const display = getPackageLifecycleDisplay({
    ad_package: "premium",
    ad_package_started_at: "2026-05-07T03:04:01.000Z",
    ad_package_expiry: "2026-06-06",
  });

  assert.equal(display.packageName, "Premium");
  assert.equal(display.startedLabel, "May 7, 2026");
  assert.equal(display.expiresLabel, "Expires Jun 6, 2026");
  assert.equal(display.tone, "premium");
  assert.equal(display.isActivePaidPackage, true);
});

test("getPackageLifecycleDisplay marks expired paid package dates", () => {
  const display = getPackageLifecycleDisplay({
    ad_package: "premium",
    ad_package_started_at: "2026-04-01",
    ad_package_expiry: "2026-04-30",
  }, {
    now: new Date("2026-05-07T00:00:00Z"),
  });

  assert.equal(display.expiresLabel, "Expired Apr 30, 2026");
  assert.equal(display.tone, "danger");
  assert.equal(display.isActivePaidPackage, false);
});

test("getPackageLifecycleDisplay shows an explicit expiration state for free listings", () => {
  const display = getPackageLifecycleDisplay({
    ad_package: "none",
    ad_package_started_at: null,
    ad_package_expiry: null,
  });

  assert.equal(display.packageName, "Free listing");
  assert.equal(display.startedLabel, "Not active");
  assert.equal(display.expiresLabel, "No paid package expiration");
  assert.equal(display.tone, "default");
  assert.equal(display.isActivePaidPackage, false);
});
