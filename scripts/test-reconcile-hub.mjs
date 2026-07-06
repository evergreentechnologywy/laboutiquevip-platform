import assert from "node:assert/strict";
import {
  hubEligibleForDeactivation,
  listingHubKeyFromUrl,
  recordHubListingAttempt,
} from "./lib/reconcile-hub.mjs";

assert.equal(
  listingHubKeyFromUrl("https://www.eros.com/missouri/kansas_city/kansas_city_escorts.htm"),
  "missouri/kansas_city",
);
assert.equal(
  listingHubKeyFromUrl("https://trans.eros.com/missouri/kansas_city/kansas_city_escorts.htm"),
  "missouri/kansas_city",
);
assert.equal(
  listingHubKeyFromUrl("https://www.eros.com/missouri/missouri_escorts.htm"),
  "missouri/missouri",
);

const stats = new Map();
recordHubListingAttempt(stats, "https://www.eros.com/missouri/kansas_city/kansas_city_escorts.htm", true);
recordHubListingAttempt(stats, "https://trans.eros.com/missouri/kansas_city/kansas_city_escorts.htm", false);
recordHubListingAttempt(stats, "https://massage.eros.com/missouri/kansas_city/kansas_city_escorts.htm", false);

assert.deepEqual(stats.get("missouri/kansas_city"), { success: 1, attempted: 3 });
assert.equal(hubEligibleForDeactivation(stats, "missouri/kansas_city"), true);
assert.equal(hubEligibleForDeactivation(stats, "texas/dallas"), false);

const allFailed = new Map();
recordHubListingAttempt(allFailed, "https://www.eros.com/texas/dallas/dallas_escorts.htm", false);
recordHubListingAttempt(allFailed, "https://trans.eros.com/texas/dallas/dallas_escorts.htm", false);
assert.equal(hubEligibleForDeactivation(allFailed, "texas/dallas"), false);

console.log("reconcile-hub tests passed");
