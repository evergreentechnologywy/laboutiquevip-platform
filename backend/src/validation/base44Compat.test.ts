import test from "node:test";
import assert from "node:assert/strict";
import { providerUpdateSchema } from "./base44Compat.js";

test("providerUpdateSchema accepts external verification and review account identifiers", () => {
  const parsed = providerUpdateSchema.parse({
    verification_provider: "Preferred Verifier",
    verification_username: "verified-handle",
    verification_url: "https://verifier.example/verified-handle",
    review_provider: "Trusted Reviews",
    review_username: "reviewed-handle",
    review_url: "https://reviews.example/reviewed-handle",
  });

  assert.equal(parsed.verification_provider, "Preferred Verifier");
  assert.equal(parsed.verification_username, "verified-handle");
  assert.equal(parsed.verification_url, "https://verifier.example/verified-handle");
  assert.equal(parsed.review_provider, "Trusted Reviews");
  assert.equal(parsed.review_username, "reviewed-handle");
  assert.equal(parsed.review_url, "https://reviews.example/reviewed-handle");
});
