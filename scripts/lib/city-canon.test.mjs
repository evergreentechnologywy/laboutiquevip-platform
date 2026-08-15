import {
  applyCityCanon,
  canonicalizePublicCity,
  extractTrailingKnownCity,
  isPlausiblePublicCityName,
} from "./city-canon.mjs";

let failures = 0;
function check(name, cond, detail = "") {
  if (!cond) {
    failures += 1;
    console.error("FAIL", name, detail);
  }
}

check("recover Chicago", extractTrailingKnownCity("Asian Beauty Chicago") === "Chicago");
check("recover Bellevue", extractTrailingKnownCity("BIG BUTT Bellevue") === "Bellevue");
check("keep Palm Beach Gardens", canonicalizePublicCity("Palm Beach Gardens")?.name === "Palm Beach Gardens");
check("keep Port St Lucie", canonicalizePublicCity("Port St Lucie")?.name === "Port St. Lucie");
check("NYC manhattan", canonicalizePublicCity("New York City - Manhattan")?.name === "Manhattan");
check("junk null", canonicalizePublicCity("Privacy Policy") === null);
check("plausible Miami", isPlausiblePublicCityName("Miami") === true);
check("implausible ad", isPlausiblePublicCityName("Asian Beauty Chicago") === false);

const p = { location_city: "Asian Beauty Chicago", location_state: "IL" };
const r = applyCityCanon(p);
check("mutate city", p.location_city === "Chicago" && r.cityChanged);

const p2 = { location_city: "Chicago", location_state: null };
applyCityCanon(p2);
check("infer state", p2.location_state === "IL");

const p3 = { location_city: "Statewide", location_state: "TX" };
applyCityCanon(p3);
check("statewide keep", p3.location_city === "Statewide");

if (failures) {
  console.error(failures, "FAILURES");
  process.exit(1);
}
console.log("ALL city-canon tests PASS");
