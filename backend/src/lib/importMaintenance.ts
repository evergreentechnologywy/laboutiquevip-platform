import fs from "node:fs";
import path from "node:path";
import type { ApiRequest, ApiResponse } from "../types.js";

export type ImportMaintenanceMode = "soft" | "hard" | "off";

export interface ImportFlagPayload {
  startedAt: string;
  source?: string;
  phase?: string;
  manual?: boolean;
  reason?: string;
  mode?: ImportMaintenanceMode;
}

export interface ImportMaintenanceState {
  active: boolean;
  mode: ImportMaintenanceMode;
  importInProgress: boolean;
  manualOverride: boolean;
  startedAt: string | null;
  phase: string | null;
  source: string | null;
  banner: string | null;
  retryAfterSeconds: number;
}

const DEFAULT_FLAG_PATH = "/var/run/lboutiquevip/import-in-progress";
const DEFAULT_MANUAL_PATH = "/var/run/lboutiquevip/maintenance-manual.json";
const DEFAULT_RETRY_AFTER = 900;

const PUBLIC_CATALOG_PREFIXES = [
  "/api/v1/search/",
  "/api/v1/providers/by-slug/",
  "/api/v1/seo/",
  "/sitemap.xml",
] as const;

function readJsonFile(filePath: string): ImportFlagPayload | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw) as ImportFlagPayload;
  } catch {
    return null;
  }
}

export function resolveImportFlagPath(): string {
  return process.env.IMPORT_FLAG_PATH?.trim() || DEFAULT_FLAG_PATH;
}

export function resolveManualMaintenancePath(): string {
  return process.env.IMPORT_MANUAL_PATH?.trim() || DEFAULT_MANUAL_PATH;
}

export function resolveMaintenanceMode(): ImportMaintenanceMode {
  const configured = (process.env.IMPORT_MAINTENANCE_MODE ?? "soft").trim().toLowerCase();
  if (configured === "hard" || configured === "off") return configured;
  return "soft";
}

export function resolveRetryAfterSeconds(): number {
  const parsed = Number(process.env.IMPORT_MAINTENANCE_RETRY_AFTER ?? DEFAULT_RETRY_AFTER);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RETRY_AFTER;
}

export function getImportMaintenanceState(): ImportMaintenanceState {
  const mode = resolveMaintenanceMode();
  const flag = readJsonFile(resolveImportFlagPath());
  const manual = readJsonFile(resolveManualMaintenancePath());
  const importInProgress = Boolean(flag);
  const manualOverride = Boolean(manual);
  const active = mode !== "off" && (importInProgress || manualOverride);
  const payload = manual ?? flag;
  const effectiveMode: ImportMaintenanceMode =
    manual?.mode && (manual.mode === "soft" || manual.mode === "hard") ? manual.mode : mode;

  return {
    active,
    mode: effectiveMode,
    importInProgress,
    manualOverride,
    startedAt: payload?.startedAt ?? null,
    phase: payload?.phase ?? null,
    source: payload?.source ?? null,
    banner: active ? "Catalog updating — showing last published listings" : null,
    retryAfterSeconds: resolveRetryAfterSeconds(),
  };
}

export function isPublicCatalogPath(pathname: string): boolean {
  return PUBLIC_CATALOG_PREFIXES.some((prefix) => pathname.startsWith(prefix) || pathname === prefix);
}

export function guardPublicCatalogMaintenance(request: ApiRequest): ApiResponse | null {
  if (request.method !== "GET" || !isPublicCatalogPath(request.pathname)) {
    return null;
  }

  const state = getImportMaintenanceState();
  if (!state.active || state.mode !== "hard") {
    return null;
  }

  return {
    statusCode: 503,
    headers: {
      "cache-control": "no-store",
      "retry-after": String(state.retryAfterSeconds),
      "x-catalog-maintenance": "hard",
    },
    body: {
      error: "service_unavailable",
      message: "Catalog maintenance in progress. Please retry shortly.",
      catalogMaintenance: {
        active: true,
        mode: "hard",
        banner: state.banner,
        retryAfterSeconds: state.retryAfterSeconds,
        startedAt: state.startedAt,
        phase: state.phase,
      },
    },
  };
}

export function maintenanceCacheHeaders(state: ImportMaintenanceState): Record<string, string> {
  if (!state.active || state.mode !== "soft") {
    return {};
  }

  return {
    "cache-control": "public, max-age=300, s-maxage=600, stale-while-revalidate=3600",
    "x-catalog-maintenance": "soft",
  };
}

export function maintenanceResponseExtras(state: ImportMaintenanceState): Record<string, unknown> | null {
  if (!state.active) return null;

  return {
    active: true,
    mode: state.mode,
    banner: state.banner,
    startedAt: state.startedAt,
    phase: state.phase,
    importInProgress: state.importInProgress,
    manualOverride: state.manualOverride,
  };
}

export function enrichPublicCatalogResponse(response: ApiResponse, pathname: string): ApiResponse {
  if (!isPublicCatalogPath(pathname) || response.statusCode >= 400) {
    return response;
  }

  const state = getImportMaintenanceState();
  if (!state.active) {
    return response;
  }

  const maintenanceHeaders = maintenanceCacheHeaders(state);
  const extras = maintenanceResponseExtras(state);
  const headers = { ...(response.headers ?? {}), ...maintenanceHeaders };

  if (state.mode === "soft" && extras && response.body && typeof response.body === "object" && !Array.isArray(response.body)) {
    return {
      ...response,
      headers,
      body: {
        ...(response.body as Record<string, unknown>),
        catalogMaintenance: extras,
      },
    };
  }

  return { ...response, headers };
}

export function writeImportFlag(payload: ImportFlagPayload, filePath = resolveImportFlagPath()): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

export function clearImportFlag(filePath = resolveImportFlagPath()): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // best-effort on VPS; backend may lack write perms for orchestrator-owned flag
  }
}

export function writeManualMaintenance(payload: ImportFlagPayload, filePath = resolveManualMaintenancePath()): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ ...payload, manual: true })}\n`, "utf8");
}

export function clearManualMaintenance(filePath = resolveManualMaintenancePath()): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}
