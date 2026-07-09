#!/usr/bin/env node
/**
 * Generate scripts/data/us-top5-cities-by-state.json from US Census PEP API.
 * Source: Census Bureau Population Estimates Program (July 1, 2023).
 *
 * Usage: node scripts/generate-us-top5-cities-data.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "data", "us-top5-cities-by-state.json");

/** State FIPS → USPS code (50 states + DC). */
const STATE_FIPS = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
};

function parsePlaceName(nameField) {
  const text = String(nameField ?? "");
  const comma = text.lastIndexOf(",");
  if (comma <= 0) return text.trim();
  return text.slice(0, comma).trim();
}

async function fetchTop5ForState(fips, stateCode) {
  const url =
    `https://api.census.gov/data/2023/pep/population?get=NAME,POP_2023&for=place:*&in=state:${fips}`;
  const res = await fetch(url, {
    headers: { "user-agent": "laboutiquevip-census-top5/1.0" },
  });
  if (!res.ok) throw new Error(`Census API ${stateCode} HTTP ${res.status}`);
  const rows = await res.json();
  const header = rows[0];
  const nameIdx = header.indexOf("NAME");
  const popIdx = header.indexOf("POP_2023");
  const places = rows.slice(1).map((row) => ({
    name: parsePlaceName(row[nameIdx]),
    population: Number(row[popIdx]),
  }));
  places.sort((a, b) => b.population - a.population);
  const top5 = places.slice(0, 5).map((p) => ({
    name: p.name,
    population: p.population,
  }));
  return top5;
}

async function main() {
  const states = {};
  let totalCities = 0;
  for (const [fips, code] of Object.entries(STATE_FIPS)) {
    const top5 = await fetchTop5ForState(fips, code);
    states[code] = top5;
    totalCities += top5.length;
    console.log(`${code}: ${top5.map((c) => c.name).join(", ")}`);
    await new Promise((r) => setTimeout(r, 120));
  }

  const payload = {
    source: "US Census Bureau PEP API — Population Estimates July 1, 2023 (place level)",
    generatedAt: new Date().toISOString().slice(0, 10),
    stateCount: Object.keys(states).length,
    citiesPerState: 5,
    totalCities,
    states,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${OUT} (${totalCities} cities across ${Object.keys(states).length} states/DC)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
