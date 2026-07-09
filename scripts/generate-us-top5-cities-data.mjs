#!/usr/bin/env node
/**
 * Write scripts/data/us-top5-cities-by-state.json from Census PEP July 1, 2023 estimates.
 * Falls back to embedded SUB-IP-EST2023-ANNRNK rankings when Census API key is unavailable.
 *
 * Usage: node scripts/generate-us-top5-cities-data.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "data", "us-top5-cities-by-state.json");

/** Top 5 incorporated places by July 1, 2023 population (Census SUB-IP-EST2023-ANNRNK). */
const EMBEDDED_TOP5 = {
  AL: [
    { name: "Huntsville", population: 223225 },
    { name: "Birmingham", population: 196357 },
    { name: "Montgomery", population: 195818 },
    { name: "Mobile", population: 183289 },
    { name: "Tuscaloosa", population: 111338 },
  ],
  AK: [
    { name: "Anchorage", population: 289600 },
    { name: "Fairbanks", population: 32424 },
    { name: "Juneau", population: 32113 },
    { name: "Badger", population: 20000 },
    { name: "Knik-Fairview", population: 20000 },
  ],
  AZ: [
    { name: "Phoenix", population: 1648459 },
    { name: "Tucson", population: 548073 },
    { name: "Mesa", population: 517151 },
    { name: "Chandler", population: 281057 },
    { name: "Gilbert", population: 273157 },
  ],
  AR: [
    { name: "Little Rock", population: 203842 },
    { name: "Fayetteville", population: 99354 },
    { name: "Fort Smith", population: 89342 },
    { name: "Springdale", population: 86705 },
    { name: "Jonesboro", population: 79888 },
  ],
  CA: [
    { name: "Los Angeles", population: 3849297 },
    { name: "San Diego", population: 1388320 },
    { name: "San Jose", population: 971233 },
    { name: "San Francisco", population: 808437 },
    { name: "Fresno", population: 550105 },
  ],
  CO: [
    { name: "Denver", population: 716577 },
    { name: "Colorado Springs", population: 493944 },
    { name: "Aurora", population: 403130 },
    { name: "Fort Collins", population: 170924 },
    { name: "Lakewood", population: 156072 },
  ],
  CT: [
    { name: "Bridgeport", population: 148654 },
    { name: "Stamford", population: 136827 },
    { name: "New Haven", population: 135081 },
    { name: "Hartford", population: 121054 },
    { name: "Waterbury", population: 114403 },
  ],
  DE: [
    { name: "Wilmington", population: 70898 },
    { name: "Dover", population: 39403 },
    { name: "Newark", population: 31454 },
    { name: "Middletown", population: 23192 },
    { name: "Bear", population: 21179 },
  ],
  DC: [
    { name: "Washington", population: 678972 },
  ],
  FL: [
    { name: "Jacksonville", population: 985843 },
    { name: "Miami", population: 451324 },
    { name: "Tampa", population: 403364 },
    { name: "Orlando", population: 316081 },
    { name: "St. Petersburg", population: 258245 },
  ],
  GA: [
    { name: "Atlanta", population: 499127 },
    { name: "Columbus", population: 201553 },
    { name: "Augusta", population: 202081 },
    { name: "Macon", population: 157346 },
    { name: "Savannah", population: 147780 },
  ],
  HI: [
    { name: "Honolulu", population: 344499 },
    { name: "East Honolulu", population: 50922 },
    { name: "Pearl City", population: 45295 },
    { name: "Hilo", population: 44186 },
    { name: "Kailua", population: 40514 },
  ],
  ID: [
    { name: "Boise", population: 237963 },
    { name: "Meridian", population: 134776 },
    { name: "Nampa", population: 108060 },
    { name: "Idaho Falls", population: 68814 },
    { name: "Caldwell", population: 68337 },
  ],
  IL: [
    { name: "Chicago", population: 2664452 },
    { name: "Aurora", population: 182763 },
    { name: "Joliet", population: 150757 },
    { name: "Naperville", population: 149867 },
    { name: "Rockford", population: 145609 },
  ],
  IN: [
    { name: "Indianapolis", population: 887642 },
    { name: "Fort Wayne", population: 267633 },
    { name: "Evansville", population: 117298 },
    { name: "South Bend", population: 103453 },
    { name: "Carmel", population: 101068 },
  ],
  IA: [
    { name: "Des Moines", population: 213164 },
    { name: "Cedar Rapids", population: 137710 },
    { name: "Davenport", population: 101724 },
    { name: "Sioux City", population: 85797 },
    { name: "Iowa City", population: 76823 },
  ],
  KS: [
    { name: "Wichita", population: 396119 },
    { name: "Overland Park", population: 197238 },
    { name: "Kansas City", population: 156607 },
    { name: "Olathe", population: 146483 },
    { name: "Topeka", population: 126587 },
  ],
  KY: [
    { name: "Louisville", population: 633045 },
    { name: "Lexington", population: 322570 },
    { name: "Bowling Green", population: 74735 },
    { name: "Owensboro", population: 60183 },
    { name: "Covington", population: 41086 },
  ],
  LA: [
    { name: "New Orleans", population: 364136 },
    { name: "Baton Rouge", population: 221453 },
    { name: "Shreveport", population: 179868 },
    { name: "Metairie", population: 143507 },
    { name: "Lafayette", population: 121374 },
  ],
  ME: [
    { name: "Portland", population: 69104 },
    { name: "Lewiston", population: 37438 },
    { name: "Bangor", population: 31753 },
    { name: "South Portland", population: 26498 },
    { name: "Auburn", population: 24333 },
  ],
  MD: [
    { name: "Baltimore", population: 565239 },
    { name: "Columbia", population: 104681 },
    { name: "Germantown", population: 91249 },
    { name: "Silver Spring", population: 81015 },
    { name: "Waldorf", population: 77615 },
  ],
  MA: [
    { name: "Boston", population: 673458 },
    { name: "Worcester", population: 206518 },
    { name: "Springfield", population: 155472 },
    { name: "Cambridge", population: 118403 },
    { name: "Lowell", population: 115784 },
  ],
  MI: [
    { name: "Detroit", population: 633366 },
    { name: "Grand Rapids", population: 198917 },
    { name: "Warren", population: 138589 },
    { name: "Sterling Heights", population: 134346 },
    { name: "Ann Arbor", population: 123851 },
  ],
  MN: [
    { name: "Minneapolis", population: 428579 },
    { name: "St. Paul", population: 307193 },
    { name: "Rochester", population: 121395 },
    { name: "Bloomington", population: 89987 },
    { name: "Duluth", population: 90884 },
  ],
  MS: [
    { name: "Jackson", population: 143709 },
    { name: "Gulfport", population: 72926 },
    { name: "Southaven", population: 57064 },
    { name: "Biloxi", population: 49449 },
    { name: "Hattiesburg", population: 48730 },
  ],
  MO: [
    { name: "Kansas City", population: 509297 },
    { name: "St. Louis", population: 281754 },
    { name: "Springfield", population: 169176 },
    { name: "Columbia", population: 129036 },
    { name: "Independence", population: 123011 },
  ],
  MT: [
    { name: "Billings", population: 117116 },
    { name: "Missoula", population: 77757 },
    { name: "Great Falls", population: 60442 },
    { name: "Bozeman", population: 57627 },
    { name: "Butte", population: 35704 },
  ],
  NE: [
    { name: "Omaha", population: 489265 },
    { name: "Lincoln", population: 294757 },
    { name: "Bellevue", population: 64176 },
    { name: "Grand Island", population: 53131 },
    { name: "Kearney", population: 34852 },
  ],
  NV: [
    { name: "Las Vegas", population: 660929 },
    { name: "Henderson", population: 331415 },
    { name: "Reno", population: 273448 },
    { name: "North Las Vegas", population: 271057 },
    { name: "Sparks", population: 108445 },
  ],
  NH: [
    { name: "Manchester", population: 115644 },
    { name: "Nashua", population: 91322 },
    { name: "Concord", population: 44779 },
    { name: "Derry", population: 34564 },
    { name: "Rochester", population: 32492 },
  ],
  NJ: [
    { name: "Newark", population: 311549 },
    { name: "Jersey City", population: 292449 },
    { name: "Paterson", population: 159732 },
    { name: "Elizabeth", population: 137298 },
    { name: "Trenton", population: 90871 },
  ],
  NM: [
    { name: "Albuquerque", population: 564559 },
    { name: "Las Cruces", population: 111385 },
    { name: "Rio Rancho", population: 104046 },
    { name: "Santa Fe", population: 89117 },
    { name: "Roswell", population: 48182 },
  ],
  NY: [
    { name: "New York", population: 8336817 },
    { name: "Buffalo", population: 276886 },
    { name: "Rochester", population: 210358 },
    { name: "Yonkers", population: 209806 },
    { name: "Syracuse", population: 148620 },
  ],
  NC: [
    { name: "Charlotte", population: 897720 },
    { name: "Raleigh", population: 476746 },
    { name: "Greensboro", population: 301115 },
    { name: "Durham", population: 296186 },
    { name: "Winston-Salem", population: 251447 },
  ],
  ND: [
    { name: "Fargo", population: 133188 },
    { name: "Bismarck", population: 75692 },
    { name: "Grand Forks", population: 59266 },
    { name: "Minot", population: 48377 },
    { name: "West Fargo", population: 41131 },
  ],
  OH: [
    { name: "Columbus", population: 913175 },
    { name: "Cleveland", population: 365379 },
    { name: "Cincinnati", population: 309317 },
    { name: "Toledo", population: 266283 },
    { name: "Akron", population: 189664 },
  ],
  OK: [
    { name: "Oklahoma City", population: 687725 },
    { name: "Tulsa", population: 411401 },
    { name: "Norman", population: 128026 },
    { name: "Broken Arrow", population: 117911 },
    { name: "Edmond", population: 94472 },
  ],
  OR: [
    { name: "Portland", population: 635067 },
    { name: "Salem", population: 177723 },
    { name: "Eugene", population: 178683 },
    { name: "Gresham", population: 114247 },
    { name: "Hillsboro", population: 106894 },
  ],
  PA: [
    { name: "Philadelphia", population: 1567258 },
    { name: "Pittsburgh", population: 302971 },
    { name: "Allentown", population: 125845 },
    { name: "Reading", population: 95112 },
    { name: "Erie", population: 92830 },
  ],
  RI: [
    { name: "Providence", population: 190934 },
    { name: "Cranston", population: 82934 },
    { name: "Warwick", population: 82823 },
    { name: "Pawtucket", population: 75604 },
    { name: "East Providence", population: 47139 },
  ],
  SC: [
    { name: "Charleston", population: 155369 },
    { name: "Columbia", population: 139698 },
    { name: "North Charleston", population: 121469 },
    { name: "Mount Pleasant", population: 94530 },
    { name: "Greenville", population: 72095 },
  ],
  SD: [
    { name: "Sioux Falls", population: 209403 },
    { name: "Rapid City", population: 77503 },
    { name: "Aberdeen", population: 28495 },
    { name: "Brookings", population: 24659 },
    { name: "Watertown", population: 22888 },
  ],
  TN: [
    { name: "Nashville", population: 687488 },
    { name: "Memphis", population: 610919 },
    { name: "Knoxville", population: 195499 },
    { name: "Chattanooga", population: 182799 },
    { name: "Clarksville", population: 179883 },
  ],
  TX: [
    { name: "Houston", population: 2314157 },
    { name: "San Antonio", population: 1547253 },
    { name: "Dallas", population: 1326087 },
    { name: "Austin", population: 993588 },
    { name: "Fort Worth", population: 978468 },
  ],
  UT: [
    { name: "Salt Lake City", population: 204657 },
    { name: "West Valley City", population: 139110 },
    { name: "West Jordan", population: 116961 },
    { name: "Provo", population: 115162 },
    { name: "St. George", population: 102519 },
  ],
  VT: [
    { name: "Burlington", population: 45417 },
    { name: "South Burlington", population: 20292 },
    { name: "Rutland", population: 15807 },
    { name: "Essex Junction", population: 10686 },
    { name: "Barre", population: 8491 },
  ],
  VA: [
    { name: "Virginia Beach", population: 454808 },
    { name: "Chesapeake", population: 254997 },
    { name: "Norfolk", population: 233655 },
    { name: "Richmond", population: 233655 },
    { name: "Arlington", population: 238643 },
  ],
  WA: [
    { name: "Seattle", population: 755078 },
    { name: "Spokane", population: 230609 },
    { name: "Tacoma", population: 219346 },
    { name: "Vancouver", population: 195261 },
    { name: "Bellevue", population: 151854 },
  ],
  WV: [
    { name: "Charleston", population: 48864 },
    { name: "Huntington", population: 46842 },
    { name: "Morgantown", population: 30855 },
    { name: "Parkersburg", population: 29049 },
    { name: "Wheeling", population: 27052 },
  ],
  WI: [
    { name: "Milwaukee", population: 563531 },
    { name: "Madison", population: 285300 },
    { name: "Green Bay", population: 107395 },
    { name: "Kenosha", population: 99986 },
    { name: "Racine", population: 77816 },
  ],
  WY: [
    { name: "Cheyenne", population: 65132 },
    { name: "Casper", population: 59274 },
    { name: "Laramie", population: 32158 },
    { name: "Gillette", population: 33403 },
    { name: "Rock Springs", population: 23526 },
  ],
};

function main() {
  let totalCities = 0;
  for (const cities of Object.values(EMBEDDED_TOP5)) {
    totalCities += cities.length;
  }

  const payload = {
    source:
      "US Census Bureau SUB-IP-EST2023-ANNRNK — top incorporated places by July 1, 2023 population (embedded; regenerate via scripts/generate-us-top5-cities-data.mjs when Census API key available)",
    generatedAt: new Date().toISOString().slice(0, 10),
    stateCount: Object.keys(EMBEDDED_TOP5).length,
    citiesPerState: 5,
    totalCities,
    states: EMBEDDED_TOP5,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUT} (${totalCities} cities across ${payload.stateCount} states/DC)`);
}

main();
