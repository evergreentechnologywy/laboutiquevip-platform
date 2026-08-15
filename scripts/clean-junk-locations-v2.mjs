#!/usr/bin/env node
/**
 * Rewrite polluted Provider.location_city using backend locationMatch canon.
 * Source of truth: backend/dist/lib/locationMatch.js
 *
 * Usage:
 *   node scripts/clean-junk-locations-v2.mjs           # dry-run
 *   node scripts/clean-junk-locations-v2.mjs --apply   # write
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "../backend/generated/prisma-client/index.js";
import {
  canonicalizePublicCity,
  resolveStateFromCity,
  isPlausiblePublicCityName,
} from "../backend/dist/lib/locationMatch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const TAG = "lbv-city-canon-v2-2026-08-15";

function loadEnv() {
  for (const p of [
    path.resolve(__dirname, "../backend/.env"),
    path.resolve(__dirname, "../.env"),
    "/etc/laboutiquevip/backend.env",
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function decide(city, state) {
  const raw = city == null ? "" : String(city);
  const trimmed = raw.trim();
  if (!trimmed) return { action: "keep", next: city, reason: "empty" };
  if (/^statewide$/i.test(trimmed)) {
    return trimmed === "Statewide"
      ? { action: "keep", next: "Statewide", reason: "statewide" }
      : { action: "rewrite", next: "Statewide", reason: "statewide-case" };
  }
  const canon = canonicalizePublicCity(trimmed, state);
  if (canon?.name) {
    if (canon.name === trimmed) return { action: "keep", next: trimmed, reason: "already-canon" };
    return { action: "rewrite", next: canon.name, reason: "canon" };
  }
  // No recoverable city — null polluted values so SEO hubs drop them
  if (!isPlausiblePublicCityName(trimmed)) {
    return { action: "null", next: null, reason: "implausible" };
  }
  return { action: "keep", next: trimmed, reason: "plausible-unknown" };
}

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  const rows = await prisma.$queryRaw`
    SELECT id, location_city, location_state, status
    FROM "Provider"
    WHERE location_city IS NOT NULL
      AND btrim(location_city) <> ''
  `;

  const decisions = [];
  let rewrite = 0;
  let nulled = 0;
  let keep = 0;
  const samples = { rewrite: [], null: [] };

  for (const row of rows) {
    const d = decide(row.location_city, row.location_state);
    if (d.action === "keep") {
      keep += 1;
      continue;
    }
    decisions.push({
      id: row.id,
      from: row.location_city,
      to: d.next,
      state: row.location_state,
      action: d.action,
      reason: d.reason,
      status: row.status,
    });
    if (d.action === "rewrite") {
      rewrite += 1;
      if (samples.rewrite.length < 40) {
        samples.rewrite.push(`${row.location_city} -> ${d.next}`);
      }
    } else if (d.action === "null") {
      nulled += 1;
      if (samples.null.length < 40) {
        samples.null.push(String(row.location_city));
      }
    }
  }

  const summary = {
    scanned: rows.length,
    keep,
    rewrite,
    nulled,
    apply: APPLY,
    tag: TAG,
    samples,
  };
  fs.writeFileSync("/tmp/lbv-city-clean-v2.json", JSON.stringify({ summary, decisions }, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  if (!APPLY) {
    console.log("dry-run only; re-run with --apply to write");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const d of decisions) {
    if (d.action === "rewrite") {
      await prisma.$executeRaw`
        UPDATE "Provider"
        SET location_city = ${d.to},
            updated_date = NOW(),
            admin_notes = CASE
              WHEN admin_notes IS NULL OR btrim(admin_notes) = '' THEN ${TAG}
              WHEN admin_notes LIKE ${"%" + TAG + "%"} THEN admin_notes
              ELSE admin_notes || ${" | " + TAG}
            END
        WHERE id = ${d.id}::uuid
      `;
      // Fill missing state from known map when possible
      const inferred = resolveStateFromCity(d.to);
      if (inferred && !d.state) {
        await prisma.$executeRaw`
          UPDATE "Provider"
          SET location_state = ${inferred}
          WHERE id = ${d.id}::uuid
            AND (location_state IS NULL OR btrim(location_state) = '')
        `;
      }
      updated += 1;
    } else if (d.action === "null") {
      await prisma.$executeRaw`
        UPDATE "Provider"
        SET location_city = NULL,
            updated_date = NOW(),
            admin_notes = CASE
              WHEN admin_notes IS NULL OR btrim(admin_notes) = '' THEN ${TAG + ":null-city"}
              WHEN admin_notes LIKE ${"%" + TAG + "%"} THEN admin_notes
              ELSE admin_notes || ${" | " + TAG + ":null-city"}
            END
        WHERE id = ${d.id}::uuid
      `;
      updated += 1;
    }
  }

  console.log(JSON.stringify({ written: updated }, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
