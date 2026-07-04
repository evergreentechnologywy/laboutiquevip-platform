#!/usr/bin/env node
/**
 * One-shot backfill: set location_state for active Eros providers where it is null/empty.
 * Derives state from verification_url hub path (eros.com/{state}/{city}/files/...),
 * then city mapping. Safe UPDATE only — does not touch import processes.
 *
 * Usage:
 *   node scripts/backfill-eros-location-state.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveErosLocationState } from "./lib/eros-location.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!(key in process.env)) process.env[key] = rest.join("=").replace(/^"|"$/g, "");
  }
}

// Prefer VPS deploy path, then local repo .env
loadEnv("/srv/apps/trystlike/repo/.env");
loadEnv(path.resolve(__dirname, "../.env"));
loadEnv(path.resolve(__dirname, "../backend/.env"));

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  const candidates = [
    path.resolve(__dirname, "../backend/generated/prisma-client/index.js"),
    "/srv/apps/trystlike/repo/backend/generated/prisma-client/index.js",
  ];
  for (const candidate of candidates) {
    try {
      const generated = await dynamicImport(candidate);
      if (generated?.PrismaClient) return new generated.PrismaClient();
    } catch {
      // try next
    }
  }
  const runtime = await dynamicImport("@prisma/client");
  if (!runtime?.PrismaClient) throw new Error("PrismaClient not available.");
  return new runtime.PrismaClient();
}

async function main() {
  const prisma = await createPrismaClient();

  try {
    const whereNullState = {
      verification_provider: "eros",
      status: "active",
      OR: [{ location_state: null }, { location_state: "" }],
    };

    const beforeNull = await prisma.provider.count({ where: whereNullState });
    const beforeActive = await prisma.provider.count({
      where: { verification_provider: "eros", status: "active" },
    });
    const beforeFlorida = await prisma.provider.count({
      where: {
        verification_provider: "eros",
        status: "active",
        is_profile_approved: true,
        OR: [
          { location_state: { equals: "FL", mode: "insensitive" } },
          { location_state: { equals: "Florida", mode: "insensitive" } },
          { location_state: { contains: "florida", mode: "insensitive" } },
        ],
      },
    });

    console.log(
      JSON.stringify(
        {
          phase: "before",
          active_eros: beforeActive,
          null_location_state: beforeNull,
          florida_eros: beforeFlorida,
          dryRun,
        },
        null,
        2,
      ),
    );

    const rows = await prisma.provider.findMany({
      where: whereNullState,
      select: {
        id: true,
        display_name: true,
        location_city: true,
        location_state: true,
        verification_url: true,
      },
    });

    let updated = 0;
    let unresolved = 0;
    const samples = [];

    for (const row of rows) {
      const location_state = resolveErosLocationState({
        location_state: row.location_state,
        location_city: row.location_city,
        verification_url: row.verification_url,
      });

      if (!location_state) {
        unresolved += 1;
        continue;
      }

      if (samples.length < 8) {
        samples.push({
          id: row.id,
          display_name: row.display_name,
          location_city: row.location_city,
          verification_url: row.verification_url,
          location_state,
        });
      }

      if (!dryRun) {
        await prisma.provider.update({
          where: { id: row.id },
          data: { location_state },
        });
      }
      updated += 1;
    }

    const afterNull = dryRun
      ? beforeNull - updated
      : await prisma.provider.count({ where: whereNullState });
    const afterFlorida = dryRun
      ? null
      : await prisma.provider.count({
          where: {
            verification_provider: "eros",
            status: "active",
            is_profile_approved: true,
            OR: [
              { location_state: { equals: "FL", mode: "insensitive" } },
              { location_state: { equals: "Florida", mode: "insensitive" } },
              { location_state: { contains: "florida", mode: "insensitive" } },
            ],
          },
        });

    console.log(
      JSON.stringify(
        {
          phase: "after",
          updated,
          unresolved,
          null_location_state: afterNull,
          florida_eros: afterFlorida,
          samples,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
