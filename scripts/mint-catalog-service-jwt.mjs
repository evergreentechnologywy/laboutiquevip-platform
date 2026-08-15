#!/usr/bin/env node
/**
 * Mint a short-lived service JWT for catalog ingest / Aura workers.
 * Uses LBV JWT_SECRET (or LBV_JWT_SECRET). Does not print secret.
 *
 * Usage:
 *   node scripts/mint-catalog-service-jwt.mjs [--ttl=7d] [--sub=aura-catalog-worker]
 *   # prints token only on stdout
 */
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, "backend", ".env"));

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

const secret = process.env.JWT_SECRET || process.env.LBV_JWT_SECRET || "";
if (!secret) {
  console.error("JWT_SECRET / LBV_JWT_SECRET missing");
  process.exit(2);
}

const ttl = args.get("ttl") || "7d";
const sub = args.get("sub") || "catalog-worker";

const token = jwt.sign(
  {
    sub,
    role: "service",
    scope: "catalog:ingest",
  },
  secret,
  { algorithm: "HS256", expiresIn: ttl },
);

process.stdout.write(`${token}\n`);
