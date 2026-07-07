import fs from "node:fs/promises";
import path from "node:path";
import { resolveImportFlagPath } from "./importMaintenance.js";

const DEFAULT_RUN_DIR = "/var/run/lboutiquevip";
const DEFAULT_LOG_DIR = "/var/log/laboutiquevip";
const DEFAULT_CACHE_ROOT = "/var/run/lboutiquevip/catalog-scan-cache";

export const MERGE_PHASES = [
  "merge-cache",
  "staged-r2-photos",
  "reconcile-eros",
  "reconcile-tryst",
  "match-review",
  "dedupe",
  "evergreen-models",
  "eros-r2-photos",
  "tryst-r2-photos",
] as const;

export type CatalogLogSource = "scan" | "merge" | "evergreen" | "eros" | "tryst" | "orchestrator";

export interface CatalogPipelineStatus {
  schedule: {
    timezone: string;
    scanCron: string;
    mergeCron: string;
    failsafeCron: string;
    orchestratorPoll: string;
  };
  caps: {
    profilesPerCity: number;
    profilesPerState: number;
    erosMaxPages: number;
    trystMaxProfilesPerCity: number;
    trystMaxCitiesPerState: number;
    strictVerificationGate: boolean;
    reviewMatchLimit: number;
  };
  staging: {
    cacheRoot: string;
    latestCacheDir: string | null;
    manifest: Record<string, unknown> | null;
    erosRecords: number | null;
    trystRecords: number | null;
  };
  scan: {
    inProgress: boolean;
    phase: string | null;
    startedAt: string | null;
    lastReportLine: string | null;
    logFile: string;
    reportFile: string;
  };
  merge: {
    inProgress: boolean;
    phase: string | null;
    startedAt: string | null;
    lastReportLine: string | null;
    logFile: string;
    reportFile: string;
  };
  notify: {
    stateFile: string;
    state: Record<string, unknown> | null;
  };
  legacyOrchestrator: {
    note: string;
    stepsEnabled: string[];
  };
}

function runDir(): string {
  return process.env.LBV_TRIGGER_DIR?.trim() || DEFAULT_RUN_DIR;
}

function logDir(): string {
  return process.env.LBV_LOG_DIR?.trim() || DEFAULT_LOG_DIR;
}

function cacheRoot(): string {
  return process.env.CATALOG_SCAN_CACHE_ROOT?.trim() || DEFAULT_CACHE_ROOT;
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readLastLine(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines.length ? lines[lines.length - 1]! : null;
  } catch {
    return null;
  }
}

async function countNdjsonLines(filePath: string): Promise<number | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw.split(/\r?\n/).filter(Boolean).length;
  } catch {
    return null;
  }
}

async function resolveLatestCacheDir(root: string): Promise<string | null> {
  const latestLink = path.join(root, "latest");
  try {
    const stat = await fs.lstat(latestLink);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      return await fs.realpath(latestLink);
    }
  } catch {
    // fall through
  }

  const pathFile = path.join(root, "latest-path.txt");
  try {
    const dir = (await fs.readFile(pathFile, "utf8")).trim();
    if (dir) {
      await fs.access(dir);
      return dir;
    }
  } catch {
    // fall through
  }

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const dated = entries
      .filter((entry) => entry.isDirectory() && /^\d{8}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .pop();
    return dated ? path.join(root, dated) : null;
  } catch {
    return null;
  }
}

function parseCaps() {
  const num = (key: string, fallback: number) => {
    const parsed = Number(process.env[key]);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    profilesPerCity: num("PROFILES_PER_CITY", 250),
    profilesPerState: num("PROFILES_PER_STATE", 1250),
    erosMaxPages: num("EROS_MAX_PAGES", 15000),
    trystMaxProfilesPerCity: num("TRYST_MAX_PROFILES_PER_CITY", 250),
    trystMaxCitiesPerState: num("TRYST_MAX_CITIES_PER_STATE", 5),
    strictVerificationGate: (process.env.STRICT_IMPORT_VERIFICATION_GATE ?? "1") !== "0",
    reviewMatchLimit: num("REVIEW_MATCH_LIMIT", 0),
  };
}

async function readScanFlag(): Promise<{ inProgress: boolean; phase: string | null; startedAt: string | null }> {
  const flagPath =
    process.env.SCAN_FLAG_PATH?.trim() || path.join(runDir(), "catalog-scan-in-progress.json");
  const payload = await readJsonIfExists(flagPath);
  if (!payload) {
    return { inProgress: false, phase: null, startedAt: null };
  }
  const source = typeof payload.source === "string" ? payload.source : "";
  return {
    inProgress: source === "us-verified-catalog-scan",
    phase: typeof payload.phase === "string" ? payload.phase : null,
    startedAt: typeof payload.startedAt === "string" ? payload.startedAt : null,
  };
}

async function readMergeFlag(): Promise<{ inProgress: boolean; phase: string | null; startedAt: string | null }> {
  const flagPath = resolveImportFlagPath();
  const payload = await readJsonIfExists(flagPath);
  if (!payload) {
    return { inProgress: false, phase: null, startedAt: null };
  }
  const source = typeof payload.source === "string" ? payload.source : "";
  const inProgress = source === "us-verified-catalog-merge";
  return {
    inProgress,
    phase: typeof payload.phase === "string" ? payload.phase : null,
    startedAt: typeof payload.startedAt === "string" ? payload.startedAt : null,
  };
}

export async function readCatalogPipelineStatus(): Promise<CatalogPipelineStatus> {
  const root = cacheRoot();
  const latestCacheDir = await resolveLatestCacheDir(root);
  const manifest =
    latestCacheDir != null ? await readJsonIfExists(path.join(latestCacheDir, "manifest.json")) : null;
  const erosRecords =
    latestCacheDir != null ? await countNdjsonLines(path.join(latestCacheDir, "eros.ndjson")) : null;
  const trystRecords =
    latestCacheDir != null ? await countNdjsonLines(path.join(latestCacheDir, "tryst.ndjson")) : null;

  const scanLog = path.join(logDir(), "us-verified-catalog-scan.log");
  const scanReport = path.join(logDir(), "us-verified-catalog-scan-report.log");
  const mergeLog = path.join(logDir(), "us-verified-catalog-merge.log");
  const mergeReport = path.join(logDir(), "us-verified-catalog-merge-report.log");
  const stateFile = path.join(runDir(), "catalog-scan-state.json");

  const mergeFlag = await readMergeFlag();
  const scanFlag = await readScanFlag();

  return {
    schedule: {
      timezone: "America/Denver",
      scanCron: "0 20 * * * (8:00 PM — cache-only Eros + Tryst scrape)",
      mergeCron: "0 0 * * * (midnight — production merge + R2 + reconcile + Evergreen models)",
      failsafeCron: "*/15 * * * * (stale lock / import flag cleanup)",
      orchestratorPoll: "* * * * * (manual Dev Dashboard triggers only)",
    },
    caps: parseCaps(),
    staging: {
      cacheRoot: root,
      latestCacheDir,
      manifest,
      erosRecords,
      trystRecords,
    },
    scan: {
      inProgress: scanFlag.inProgress,
      phase: scanFlag.phase,
      startedAt: scanFlag.startedAt,
      lastReportLine: await readLastLine(scanReport),
      logFile: scanLog,
      reportFile: scanReport,
    },
    merge: {
      inProgress: mergeFlag.inProgress,
      phase: mergeFlag.phase,
      startedAt: mergeFlag.startedAt,
      lastReportLine: await readLastLine(mergeReport),
      logFile: mergeLog,
      reportFile: mergeReport,
    },
    notify: {
      stateFile,
      state: await readJsonIfExists(stateFile),
    },
    legacyOrchestrator: {
      note: "Midnight production path is run-us-verified-catalog-merge.sh; orchestrator steps are disabled except optional manual review-match.",
      stepsEnabled: ["review-match (manual trigger only)"],
    },
  };
}

export function catalogLogPath(source: CatalogLogSource): string {
  const dir = logDir();
  const map: Record<CatalogLogSource, string> = {
    scan: path.join(dir, "us-verified-catalog-scan.log"),
    merge: path.join(dir, "us-verified-catalog-merge.log"),
    evergreen: path.join(dir, "evergreen-models.log"),
    eros: path.join(dir, "cron.log"),
    tryst: path.join(dir, "tryst-import.log"),
    orchestrator: path.join(dir, "orchestrator.log"),
  };
  return map[source];
}

export async function readCatalogLogTail(source: CatalogLogSource, lines = 100): Promise<string[]> {
  try {
    const raw = await fs.readFile(catalogLogPath(source), "utf8");
    return raw.split(/\r?\n/).filter(Boolean).slice(-lines);
  } catch {
    return [];
  }
}
