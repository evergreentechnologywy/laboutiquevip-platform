import fs from "node:fs/promises";
import path from "node:path";
import {
  clearManualMaintenance,
  getImportMaintenanceState,
  writeManualMaintenance,
  type ImportMaintenanceMode,
} from "./importMaintenance.js";

export type ImportSource = "eros" | "tryst" | "orchestrator";
export type ImportMode = "pilot" | "full";
export type MaintenanceMode = "off" | "soft" | "hard";

const DEFAULT_TRIGGER_DIR = "/var/run/lboutiquevip";
const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|password|token|bearer|authorization|private[_-]?key)\s*[:=]\s*\S+/gi,
  /sk_(?:live|test)_[A-Za-z0-9]+/g,
  /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g,
];

export function triggerDir(): string {
  return process.env.LBV_TRIGGER_DIR?.trim() || DEFAULT_TRIGGER_DIR;
}

function triggerPath(source: ImportSource): string {
  return path.join(triggerDir(), `trigger-${source}.request`);
}

function statusPath(source: ImportSource): string {
  return path.join(triggerDir(), `status-${source}.json`);
}

function maintenancePath(): string {
  return path.join(triggerDir(), "maintenance.json");
}

function logPath(source: ImportSource): string {
  const logDir = process.env.LBV_LOG_DIR?.trim() || "/var/log/laboutiquevip";
  const map: Record<ImportSource, string> = {
    eros: path.join(logDir, "cron.log"),
    tryst: path.join(logDir, "tryst-import.log"),
    orchestrator: path.join(logDir, "orchestrator.log"),
  };
  return map[source];
}

export async function ensureTriggerDir(): Promise<void> {
  await fs.mkdir(triggerDir(), { recursive: true });
}

export function sanitizeLogLine(line: string): string {
  let sanitized = line;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

export async function readMaintenanceState(): Promise<{
  mode: MaintenanceMode;
  updatedAt: string | null;
  updatedBy: string | null;
  importInProgress?: boolean;
  banner?: string | null;
}> {
  const state = getImportMaintenanceState();
  return {
    mode: state.active ? state.mode : "off",
    updatedAt: state.startedAt,
    updatedBy: null,
    importInProgress: state.importInProgress,
    banner: state.banner,
  };
}

export async function writeMaintenanceState(
  mode: MaintenanceMode,
  updatedBy: string | null,
): Promise<{ mode: MaintenanceMode; updatedAt: string; updatedBy: string | null }> {
  const updatedAt = new Date().toISOString();
  if (mode === "off") {
    clearManualMaintenance();
    return { mode: "off", updatedAt, updatedBy };
  }

  writeManualMaintenance({
    startedAt: updatedAt,
    source: "dev-dashboard",
    phase: "manual",
    reason: `Dev dashboard maintenance: ${mode}`,
    mode: mode as ImportMaintenanceMode,
  });

  return { mode, updatedAt, updatedBy };
}

export async function readImportStatus(source: ImportSource): Promise<Record<string, unknown>> {
  const inProgress = await isImportInProgress(source);
  let fileStatus: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(statusPath(source), "utf8");
    fileStatus = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    fileStatus = {};
  }

  return {
    source,
    inProgress,
    ...fileStatus,
  };
}

async function isImportInProgress(source: ImportSource): Promise<boolean> {
  try {
    await fs.access(triggerPath(source));
    const raw = await fs.readFile(triggerPath(source), "utf8");
    const parsed = JSON.parse(raw) as { state?: string };
    return parsed.state !== "completed" && parsed.state !== "failed";
  } catch {
    return false;
  }
}

export async function queueImportTrigger(input: {
  source: ImportSource;
  mode: ImportMode;
  requestedBy: string | null;
}): Promise<{ ok: true; path: string; payload: Record<string, unknown> }> {
  await ensureTriggerDir();
  const payload = {
    source: input.source,
    mode: input.mode,
    state: "queued",
    requestedAt: new Date().toISOString(),
    requestedBy: input.requestedBy,
  };
  const filePath = triggerPath(input.source);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { ok: true, path: filePath, payload };
}

export async function readImportLogTail(source: ImportSource, lines = 100): Promise<string[]> {
  try {
    const raw = await fs.readFile(logPath(source), "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-lines)
      .map(sanitizeLogLine);
  } catch {
    return [];
  }
}

export async function readAllImportStatuses(): Promise<Record<ImportSource, Record<string, unknown>>> {
  const sources: ImportSource[] = ["eros", "tryst", "orchestrator"];
  const entries = await Promise.all(sources.map(async (source) => [source, await readImportStatus(source)] as const));
  return Object.fromEntries(entries) as Record<ImportSource, Record<string, unknown>>;
}
