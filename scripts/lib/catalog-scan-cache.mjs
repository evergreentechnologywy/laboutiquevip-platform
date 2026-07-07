/**
 * Staging cache for US catalog scans (8 PM) before midnight production merge.
 */

import fs from "fs";
import path from "path";

const DEFAULT_ROOT = "/var/run/lboutiquevip/catalog-scan-cache";

export function resolveCacheDir(explicit) {
  const dir =
    explicit ??
    process.env.CATALOG_SCAN_CACHE_DIR ??
    process.env.LBV_CATALOG_SCAN_CACHE;
  if (!dir) {
    throw new Error("CATALOG_SCAN_CACHE_DIR is required for cache-only scan or merge.");
  }
  return path.resolve(dir);
}

export function initCacheDir(cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
  for (const name of ["eros.ndjson", "tryst.ndjson"]) {
    const file = path.join(cacheDir, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, "", "utf8");
  }
}

export function appendCacheRecord(cacheDir, source, record) {
  const file = path.join(cacheDir, `${source}.ndjson`);
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

export function finalizeCacheDir(cacheDir, meta = {}) {
  const manifest = {
    finalizedAt: new Date().toISOString(),
    ...meta,
  };
  fs.writeFileSync(path.join(cacheDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const root = path.dirname(cacheDir);
  fs.mkdirSync(root, { recursive: true });
  const latestLink = path.join(root, "latest");
  try {
    if (fs.existsSync(latestLink)) fs.unlinkSync(latestLink);
  } catch {
    // ignore
  }
  try {
    fs.symlinkSync(cacheDir, latestLink, "dir");
  } catch {
    fs.writeFileSync(path.join(root, "latest-path.txt"), `${cacheDir}\n`, "utf8");
  }
  return manifest;
}

export function resolveLatestCacheDir(root = DEFAULT_ROOT) {
  const latestLink = path.join(root, "latest");
  if (fs.existsSync(latestLink)) {
    return fs.realpathSync(latestLink);
  }
  const pathFile = path.join(root, "latest-path.txt");
  if (fs.existsSync(pathFile)) {
    const dir = fs.readFileSync(pathFile, "utf8").trim();
    if (dir && fs.existsSync(dir)) return dir;
  }
  const dated = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{8}$/.test(d.name))
    .map((d) => d.name)
    .sort()
    .pop();
  if (dated) return path.join(root, dated);
  throw new Error(`No catalog scan cache found under ${root}`);
}

export function readCacheRecords(cacheDir, source) {
  const file = path.join(cacheDir, `${source}.ndjson`);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line));
}

export function defaultDatedCacheDir(root = DEFAULT_ROOT) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return path.join(root, stamp);
}
