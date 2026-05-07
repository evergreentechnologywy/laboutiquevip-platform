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
    verification_provider: null,
    verification_username: null,
    verification_url: null,
    review_provider: null,
    review_username: null,
    review_url: null,
    verification_documents: ["doc-1"],
    pending_photos: [],
  });
  assert.equal("verification_id" in payload, false);
  assert.equal("ad_package" in payload, false);
  assert.equal("ad_package_expiry" in payload, false);
  assert.equal("ad_package_started_at" in payload, false);
});

test("buildProviderSignupPayload includes external account fields in signup payload", () => {
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

  assert.equal(payload.verification_provider, "Preferred Verifier");
  assert.equal(payload.verification_username, "provider-handle");
  assert.equal(payload.verification_url, "https://verifier.example/provider-handle");
  assert.equal(payload.review_provider, "Preferred Reviews");
  assert.equal(payload.review_username, "provider-reviews");
  assert.equal(payload.review_url, "https://reviews.example/provider-reviews");
});
