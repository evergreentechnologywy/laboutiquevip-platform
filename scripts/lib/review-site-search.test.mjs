import test from "node:test";
import assert from "node:assert/strict";
import {
  extractReviewMatchesFromSearchText,
  formatPhoneVariants,
  phoneAppearsInText,
  applySearchResultsToVerification,
} from "./review-site-search.mjs";

test("formatPhoneVariants produces common formats", () => {
  const variants = formatPhoneVariants("(702) 555-1212");
  assert.ok(variants.includes("7025551212"));
  assert.ok(variants.some((v) => v.includes("702")));
});

test("phoneAppearsInText matches digit-normalized haystack", () => {
  assert.equal(phoneAppearsInText("702-555-1212", "Call 7025551212 today"), true);
  assert.equal(phoneAppearsInText("702-555-1212", "no phone here"), false);
});

test("extractReviewMatchesFromSearchText finds TER PD TOB P411 URLs", () => {
  const text = `
    Result 1: https://www.theeroticreview.com/reviews/show.asp?id=999
    Result 2: https://privatedelights.ch/profile/sample-provider
    Result 3: https://theotherboard.com/listings/abc123
    P411 https://www.preferred411.com/P123456
  `;
  const matches = extractReviewMatchesFromSearchText(text);
  assert.match(matches.ter_url ?? "", /theeroticreview\.com\/reviews\/show\.asp/i);
  assert.match(matches.pd_url ?? "", /privatedelights\.ch/i);
  assert.match(matches.tob_url ?? "", /theotherboard\.com/i);
  assert.equal(matches.p411_id, "P123456");
});

test("applySearchResultsToVerification sets badges and review_url", () => {
  const base = {
    importAllowed: false,
    p411_url: null,
    ter_url: null,
    pd_url: null,
    tob_url: null,
    review_urls: [],
  };
  const updated = applySearchResultsToVerification(base, {
    ter: { provider: "ter", url: "https://www.theeroticreview.com/reviews/show.asp?id=1", rating: null, count: null },
    p411: { p411_url: "https://www.preferred411.com/P999999", p411_id: "P999999" },
    review_url: "https://www.theeroticreview.com/reviews/show.asp?id=1",
  });
  assert.equal(updated.importAllowed, true);
  assert.match(updated.ter_url ?? "", /theeroticreview\.com/);
  assert.match(updated.p411_url ?? "", /preferred411\.com\/P999999/i);
  assert.ok(updated.review_verified_at instanceof Date);
});
