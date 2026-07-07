import test from "node:test";
import assert from "node:assert/strict";
import {
  extractP411FromMarkdown,
  extractReviewUrlsFromMarkdown,
  mergeVerificationFields,
  passesImportGate,
  providerHasVerificationBadge,
} from "./verification-match.mjs";

test("extractP411FromMarkdown finds URL and ID patterns", () => {
  const fromUrl = extractP411FromMarkdown("See https://www.preferred411.com/P123456 for refs");
  assert.equal(fromUrl.p411_id, "P123456");
  assert.match(fromUrl.p411_url ?? "", /preferred411\.com\/P123456/i);

  const fromId = extractP411FromMarkdown("P411 # P987654 listed");
  assert.equal(fromId.p411_id, "P987654");
});

test("extractReviewUrlsFromMarkdown finds TER PD TOB links", () => {
  const urls = extractReviewUrlsFromMarkdown(
    "TER https://www.theeroticreview.com/reviews/show.asp?id=1 PD https://privatedelights.ch/profile/x TOB https://theotherboard.com/listings/y",
  );
  assert.match(urls.ter_url ?? "", /theeroticreview\.com/);
  assert.match(urls.pd_url ?? "", /privatedelights\.ch/);
  assert.match(urls.tob_url ?? "", /theotherboard\.com/);
});

test("passesImportGate requires match for new imports when enabled", () => {
  process.env.STRICT_IMPORT_VERIFICATION_GATE = "1";
  assert.equal(passesImportGate(null, { importAllowed: false }), false);
  assert.equal(passesImportGate(null, { importAllowed: true }), true);
  assert.equal(
    passesImportGate({ p411_url: "https://www.preferred411.com/P1" }, { importAllowed: false }),
    true,
  );
  process.env.STRICT_IMPORT_VERIFICATION_GATE = "0";
  assert.equal(passesImportGate(null, { importAllowed: false }), true);
  delete process.env.STRICT_IMPORT_VERIFICATION_GATE;
});

test("mergeVerificationFields preserves existing badges", () => {
  const existing = {
    p411_url: "https://www.preferred411.com/P111",
    p411_id: "P111",
    p411_verified_at: new Date("2020-01-01"),
    ter_url: "https://www.theeroticreview.com/old",
    review_verified_at: new Date("2020-01-01"),
  };
  const merged = mergeVerificationFields(existing, { importAllowed: false });
  assert.equal(merged.p411_url, existing.p411_url);
  assert.equal(merged.ter_url, existing.ter_url);
});

test("providerHasVerificationBadge", () => {
  assert.equal(providerHasVerificationBadge({ tob_url: "https://x.com" }), true);
  assert.equal(providerHasVerificationBadge({}), false);
});
