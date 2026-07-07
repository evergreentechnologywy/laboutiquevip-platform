import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_SITES_JSON = "/var/lib/siteconsole-manager/sites.json";
const DEFAULT_MODEL_PROFILES = "/root/calendar-coordinator/data/model-profiles.json";
const DEFAULT_STATUS_PATH = "/var/run/lboutiquevip/evergreen-models-last-run.json";
const DEFAULT_LOG = "/var/log/laboutiquevip/evergreen-models.log";

export interface EvergreenModelsStatus {
  autoSync: {
    enabled: true;
    schedule: string;
    note: string;
  };
  sources: {
    sitesJson: string;
    sitesAvailable: boolean;
    siteCount: number | null;
    siteDomains: string[];
    modelProfilesJson: string;
    modelProfilesAvailable: boolean;
    modelProfileCount: number | null;
    modelNames: string[];
  };
  catalog: {
    activeEvergreenProviders: number | null;
    eliteProviders: number | null;
  };
  lastRun: Record<string, unknown> | null;
  logFile: string;
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readSitesList(sitesPath: string): Promise<{ count: number; domains: string[] } | null> {
  try {
    const raw = await fs.readFile(sitesPath, "utf8");
    const sites = JSON.parse(raw) as Array<{ domain?: string }>;
    if (!Array.isArray(sites)) return null;
    const domains = sites.map((s) => String(s.domain ?? "")).filter(Boolean);
    return { count: domains.length, domains };
  } catch {
    return null;
  }
}

async function readModelProfileNames(profilesPath: string): Promise<{ count: number; names: string[] } | null> {
  try {
    const raw = await fs.readFile(profilesPath, "utf8");
    const profiles = JSON.parse(raw) as Record<string, unknown>;
    const names = Object.keys(profiles ?? {});
    return { count: names.length, names: names.slice(0, 50) };
  } catch {
    return null;
  }
}

export async function readEvergreenModelsStatus(
  dbCounts?: { activeEvergreen: number; eliteActive: number } | null,
): Promise<EvergreenModelsStatus> {
  const sitesJson = process.env.EVERGREEN_SITES_JSON?.trim() || DEFAULT_SITES_JSON;
  const modelProfilesJson = process.env.EVERGREEN_MODEL_PROFILES?.trim() || DEFAULT_MODEL_PROFILES;
  const statusPath = process.env.EVERGREEN_STATUS_PATH?.trim() || DEFAULT_STATUS_PATH;
  const logFile = process.env.EVERGREEN_LOG_FILE?.trim() || DEFAULT_LOG;

  const sites = await readSitesList(sitesJson);
  const profiles = await readModelProfileNames(modelProfilesJson);
  const lastRun = await readJsonIfExists(statusPath);

  return {
    autoSync: {
      enabled: true,
      schedule: "Midnight merge (after dedupe) — import-evergreen-models.mjs",
      note: "SiteConsole sites + calendar model-profiles → elite Provider rows with R2 photos",
    },
    sources: {
      sitesJson,
      sitesAvailable: sites != null,
      siteCount: sites?.count ?? null,
      siteDomains: sites?.domains ?? [],
      modelProfilesJson,
      modelProfilesAvailable: profiles != null,
      modelProfileCount: profiles?.count ?? null,
      modelNames: profiles?.names ?? [],
    },
    catalog: {
      activeEvergreenProviders: dbCounts?.activeEvergreen ?? null,
      eliteProviders: dbCounts?.eliteActive ?? null,
    },
    lastRun,
    logFile,
  };
}

export function evergreenLogPath(): string {
  return process.env.EVERGREEN_LOG_FILE?.trim() || DEFAULT_LOG;
}

export async function readEvergreenLogTail(lines = 100): Promise<string[]> {
  try {
    const raw = await fs.readFile(evergreenLogPath(), "utf8");
    return raw.split(/\r?\n/).filter(Boolean).slice(-lines);
  } catch {
    return [];
  }
}
