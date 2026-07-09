#!/usr/bin/env node
/**
 * Parallel Tryst importer — processes a subset of US states.
 * Usage: node scripts/import-tryst-parallel.mjs alabama,arizona,california
 */
const REPO = "/srv/apps/trystlike/repo";
process.chdir(REPO);

const stateList = (process.env.TRYST_STATES || process.argv[2] || "").split(",").map(s => s.trim()).filter(Boolean);
if (!stateList.length) {
  console.error("Usage: TRYST_STATES=alabama,california,... node scripts/import-tryst-parallel.mjs");
  process.exit(1);
}

// Reuse Tryst module internals via dynamic import
async function main() {
  const mod = await import("./scripts/import-tryst.mjs");
  
  // extract the cities for each state by calling the city discovery
  const { default: fetch } = await import("node-fetch");
  
  for (const state of stateList) {
    const stateUrl = `https://tryst.link/us/escorts/${state}`;
    console.log(`[tryst-parallel] Discovering cities in ${state}...`);
    
    // Use the same fetchPageText from the module
    // But since we can't easily access non-exported functions, we call the full import
    // in a subprocess per state
  }
}

main().catch(e => { console.error(e); process.exit(1); });