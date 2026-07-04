#!/usr/bin/env node
/**
 * One-shot backfill: set social_media.eros_state_wide from verification_url
 * for active Eros providers on whole-state hubs (state-only or state===city path).
 * Also sets location_city to "Statewide" and ensures location_state is set.
 *
 * Usage:
 *   node scripts/backfill-eros-state-wide.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isErosStateWideHub,
  parseErosLocationFromUrl,
  resolveErosLocationState,
} from "./lib/eros-location.mjs";

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

function hasStateWideFlag(socialMedia) {
  return Boolean(
    socialMedia &&
      typeof socialMedia === "object" &&
      !Array.isArray(socialMedia) &&
      socialMedia.eros_state_wide === true,
  );
}

async function countStateWide(prisma) {
  return prisma.provider.count({
    where: {
      verification_provider: "eros",
      status: "active",
      social_media: {
        path: ["eros_state_wide"],
        equals: true,
      },
    },
  });
}

async function main() {
  const prisma = await createPrismaClient();

  try {
    const beforeFlagged = await countStateWide(prisma);
    const beforeActive = await prisma.provider.count({
      where: { verification_provider: "eros", status: "active" },
    });

    console.log(
      JSON.stringify(
        {
          phase: "before",
          active_eros: beforeActive,
          eros_state_wide: beforeFlagged,
          dryRun,
        },
        null,
        2,
      ),
    );

    const rows = await prisma.provider.findMany({
      where: {
        verification_provider: "eros",
        status: "active",
      },
      select: {
        id: true,
        display_name: true,
        location_city: true,
        location_state: true,
        verification_url: true,
        social_media: true,
      },
    });

    let updated = 0;
    let alreadyFlagged = 0;
    let notStateWide = 0;
    let unresolvedState = 0;
    const samples = [];

    for (const row of rows) {
      const stateWide = isErosStateWideHub(row.verification_url);
      if (!stateWide) {
        notStateWide += 1;
        continue;
      }

      if (hasStateWideFlag(row.social_media) && row.location_city === "Statewide" && row.location_state) {
        alreadyFlagged += 1;
        continue;
      }

      const fromUrl = parseErosLocationFromUrl(row.verification_url);
      const location_state = resolveErosLocationState({
        location_state: row.location_state,
        location_city: null,
        verification_url: row.verification_url,
      }) ?? fromUrl.state;

      if (!location_state) {
        unresolvedState += 1;
        continue;
      }

      const existingSocial =
        row.social_media && typeof row.social_media === "object" && !Array.isArray(row.social_media)
          ? row.social_media
          : {};

      const social_media = {
        ...existingSocial,
        eros_state_wide: true,
      };

      if (samples.length < 10) {
        samples.push({
          id: row.id,
          display_name: row.display_name,
          verification_url: row.verification_url,
          location_city: "Statewide",
          location_state,
          prior_city: row.location_city,
          prior_state: row.location_state,
        });
      }

      if (!dryRun) {
        await prisma.provider.update({
          where: { id: row.id },
          data: {
            location_city: "Statewide",
            location_state,
            social_media,
          },
        });
      }
      updated += 1;
    }

    const afterFlagged = dryRun
      ? beforeFlagged + updated
      : await countStateWide(prisma);

    console.log(
      JSON.stringify(
        {
          phase: "after",
          updated,
          already_flagged: alreadyFlagged,
          not_state_wide: notStateWide,
          unresolved_state: unresolvedState,
          eros_state_wide: afterFlagged,
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
