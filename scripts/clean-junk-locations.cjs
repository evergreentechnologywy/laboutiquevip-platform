#!/usr/bin/env node
/**
 * Clean junk location data from Provider records.
 * Run: node scripts/clean-junk-locations.cjs [--dry-run]
 */
const { PrismaClient } = require("../backend/generated/prisma-client");
const p = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function isJunkCity(val) {
  if (!val || typeof val !== "string") return false;
  const s = val.trim();
  if (s.length > 50) return true;
  if (/^(?:https?|ftp|www|\.\.|[\[\](){}*#]|s\]\()/i.test(s)) return true;
  if (/tryst\.link|eros\.com|a4cdn|\.jpg|\.png|\.webp/i.test(s)) return true;
  if (/Caters to|Available|to be inviting|cleaned up/i.test(s)) return true;
  if (s.includes("](") || s.includes("**") || s.startsWith("*")) return true;
  // If it looks like a full sentence (has 8+ words), it's probably a bio, not a city
  if (s.split(/\s+/).length > 7) return true;
  return false;
}

function isJunkState(val) {
  if (!val || typeof val !== "string") return false;
  const s = val.trim().toUpperCase();
  // Valid US states are 2 chars or a recognized name
  if (s.length === 2 && /^[A-Z]{2}$/.test(s)) return false;
  const validStates = new Set([
    "ALABAMA","ALASKA","ARIZONA","ARKANSAS","CALIFORNIA","COLORADO","CONNECTICUT","DELAWARE",
    "FLORIDA","GEORGIA","HAWAII","IDAHO","ILLINOIS","INDIANA","IOWA","KANSAS","KENTUCKY",
    "LOUISIANA","MAINE","MARYLAND","MASSACHUSETTS","MICHIGAN","MINNESOTA","MISSISSIPPI",
    "MISSOURI","MONTANA","NEBRASKA","NEVADA","NEW HAMPSHIRE","NEW JERSEY","NEW MEXICO",
    "NEW YORK","NORTH CAROLINA","NORTH DAKOTA","OHIO","OKLAHOMA","OREGON","PENNSYLVANIA",
    "RHODE ISLAND","SOUTH CAROLINA","SOUTH DAKOTA","TENNESSEE","TEXAS","UTAH","VERMONT",
    "VIRGINIA","WASHINGTON","WEST VIRGINIA","WISCONSIN","WYOMING",
    // Common non-standard but acceptable
    "CAROLINAS","DISTRICT OF COLUMBIA","DC",
  ]);
  if (validStates.has(s)) return false;
  // Any state value >4 chars that isn't a recognized name is almost certainly junk
  if (s.length > 4) return true;
  // Mixed case or lowercase is suspect for an abbreviation
  if (/[a-z]/.test(val.trim())) return true;
  return true; // not a valid state = junk
}

(async () => {
  const all = await p.provider.findMany({
    select: { id: true, display_name: true, location_city: true, location_state: true },
  });

  let cleaned = 0;
  let cleanedCity = 0;
  let cleanedState = 0;
  let cleanedBoth = 0;

  for (const prov of all) {
    const cityJunk = isJunkCity(prov.location_city);
    const stateJunk = isJunkState(prov.location_state);
    if (!cityJunk && !stateJunk) continue;

    const data = {};
    if (cityJunk) { data.location_city = null; cleanedCity++; }
    if (stateJunk) { data.location_state = null; cleanedState++; }
    if (cityJunk && stateJunk) { cleanedBoth++; cleanedCity--; cleanedState--; }

    cleaned++;
    if (!dryRun) {
      await p.provider.update({ where: { id: prov.id }, data });
    }
  }

  console.log(JSON.stringify({
    event: "clean_junk_locations",
    dryRun,
    total: all.length,
    cleaned,
    cleanedCity: cleanedCity + cleanedBoth,
    cleanedState: cleanedState + cleanedBoth,
    cleanedBoth,
  }));

  await p.$disconnect();
})().catch(err => { console.error(err); process.exit(1); });