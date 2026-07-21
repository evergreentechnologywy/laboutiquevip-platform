/**
 * Tests for geo-validation city→state correction.
 * Run: node scripts/lib/geo-validation.test.mjs
 */
import { validateCityState, applyGeoValidation } from "./geo-validation.mjs";

const cases = [
  // [city, inputState, expectedState, expectedCorrected]
  // Unambiguous cities — must correct wrong state
  ["Milwaukee", "VA", "WI", true],
  ["Pittsburgh", "VA", "PA", true],
  ["Chicago", "NY", "IL", true],
  ["Atlanta", "TX", "GA", true],
  ["Miami", "GA", "FL", true],
  ["Boise", "WA", "ID", true],
  ["Houston", "FL", "TX", true],
  ["Beverly Hills", "FL", "CA", true],
  ["St. Louis", "IL", "MO", true],
  // Unambiguous cities — correct state stays
  ["Chicago", "IL", "IL", false],
  ["Atlanta", "GA", "GA", false],
  // Ambiguous multi-state cities — never corrected
  ["Newark", "DE", "DE", false],
  ["Newark", "NJ", "NJ", false],
  ["Columbia", "MD", "MD", false],
  ["Columbia", "SC", "SC", false],
  ["Richmond", "FL", "FL", false],
  ["Richmond", "VA", "VA", false],
  ["Manchester", "CT", "CT", false],
  ["Burlington", "NC", "NC", false],
  ["Madison", "AL", "AL", false],
  ["Kansas City", "KS", "KS", false],
  ["Springfield", "VA", "VA", false],
  ["Portland", "ME", "ME", false],
  ["Austin", "MN", "MN", false],
  ["Dayton", "TN", "TN", false],
  ["Pasadena", "TX", "TX", false],
  // Edge cases
  [null, "WI", "WI", false],
  ["Chicago", null, null, false],
  ["", "WI", "WI", false],
];

let failures = 0;
for (const [city, state, expectedState, expectedCorrected] of cases) {
  const r = validateCityState(city, state);
  if (r.state !== expectedState || r.corrected !== expectedCorrected) {
    failures++;
    console.error(`FAIL validateCityState(${city}, ${state}) -> ${r.state}/${r.corrected} (expected ${expectedState}/${expectedCorrected})`);
  }
}

// applyGeoValidation mutates payload
const p = { location_city: "Milwaukee", location_state: "VA" };
const res = applyGeoValidation(p);
if (p.location_state !== "WI" || !res.corrected || res.originalState !== "VA") {
  failures++;
  console.error("FAIL applyGeoValidation mutation:", p, res);
}
const p2 = { location_city: "Newark", location_state: "DE" };
const res2 = applyGeoValidation(p2);
if (p2.location_state !== "DE" || res2.corrected) {
  failures++;
  console.error("FAIL applyGeoValidation ambiguous skip:", p2, res2);
}

if (failures) {
  console.error(`${failures} FAILURES`);
  process.exit(1);
}
console.log(`ALL ${cases.length + 2} geo-validation tests PASS`);
