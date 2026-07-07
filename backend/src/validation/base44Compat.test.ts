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
});

test("providerUpdateSchema accepts social links and directory URLs", () => {
  const parsed = providerUpdateSchema.parse({
    social_media: {
      instagram: "vipmodel",
      onlyfans: "https://onlyfans.com/vipmodel",
      whatsapp: "17025551212",
    },
    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ter_url: "https://www.theeroticreview.com/reviews/show.asp?id=123",
    p411_url: "https://www.preferred411.com/P123456",
  });

  assert.equal(parsed.social_media?.instagram, "vipmodel");
  assert.equal(parsed.ter_url, "https://www.theeroticreview.com/reviews/show.asp?id=123");
});
