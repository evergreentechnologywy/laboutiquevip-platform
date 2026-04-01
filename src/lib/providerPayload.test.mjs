import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderSignupPayload } from "./providerPayload.js";

test("buildProviderSignupPayload strips frontend-only fields and normalizes values", () => {
  const payload = buildProviderSignupPayload({
    userId: "user-1",
    billingPeriod: "weekly",
    formData: {
      display_name: "  Test Listing  ",
      tagline: "  Hello  ",
      bio: "",
      location_city: "  Paris  ",
      location_state: "France",
      location_country: "",
      age: "33",
      phone: "  123  ",
      email: "  provider@example.com  ",
      ad_package: "premium",
      verification_documents: ["doc-1"],
      verification_id: "verification-1",
    },
  });

  assert.deepEqual(payload, {
    user_id: "user-1",
    display_name: "Test Listing",
    tagline: "Hello",
    bio: null,
    location_city: "Paris",
    location_state: "France",
    location_country: "USA",
    age: 33,
    phone: "123",
    email: "provider@example.com",
    ad_package: "premium",
    ad_package_expiry: payload.ad_package_expiry,
    verification_documents: ["doc-1"],
    pending_photos: [],
  });
  assert.equal("verification_id" in payload, false);
});

test("buildProviderSignupPayload ignores external account fields that are not part of signup payload", () => {
  const payload = buildProviderSignupPayload({
    userId: "user-2",
    billingPeriod: "monthly",
    formData: {
      display_name: "Another Listing",
      location_city: "Miami",
      location_state: "Florida",
      ad_package: "none",
      verification_provider: "Preferred Verifier",
      verification_username: "provider-handle",
      verification_url: "https://verifier.example/provider-handle",
      review_provider: "Preferred Reviews",
      review_username: "provider-reviews",
      review_url: "https://reviews.example/provider-reviews",
    },
  });

  assert.equal("verification_provider" in payload, false);
  assert.equal("verification_username" in payload, false);
  assert.equal("verification_url" in payload, false);
  assert.equal("review_provider" in payload, false);
  assert.equal("review_username" in payload, false);
  assert.equal("review_url" in payload, false);
});
