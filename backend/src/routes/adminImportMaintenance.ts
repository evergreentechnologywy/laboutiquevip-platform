import type { ApiRequest, ApiResponse } from "../types.js";
import {
  clearManualMaintenance,
  getImportMaintenanceState,
  resolveMaintenanceMode,
  writeManualMaintenance,
  type ImportMaintenanceMode,
} from "../lib/importMaintenance.js";

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

function parseMode(value: unknown): ImportMaintenanceMode | null {
  if (value === "soft" || value === "hard" || value === "off") return value;
  return null;
}

/** GET /api/admin/import/maintenance */
export function adminImportMaintenanceGetHandler(_request: ApiRequest): ApiResponse {
  const state = getImportMaintenanceState();
  return json(200, {
    configuredMode: resolveMaintenanceMode(),
    state,
  });
}

/** POST /api/admin/import/maintenance — Clerk admin manual toggle */
export function adminImportMaintenancePostHandler(request: ApiRequest): ApiResponse {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const enabled = Boolean(body.enabled);
  const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;
  const mode = parseMode(body.mode);

  if (enabled) {
    writeManualMaintenance({
      startedAt: new Date().toISOString(),
      source: "admin",
      phase: "manual",
      reason: reason || "Admin maintenance toggle",
      mode: mode ?? undefined,
    });
  } else {
    clearManualMaintenance();
  }

  return json(200, {
    ok: true,
    enabled,
    state: getImportMaintenanceState(),
  });
}

/** DELETE /api/admin/import/maintenance — clear manual override only */
export function adminImportMaintenanceDeleteHandler(_request: ApiRequest): ApiResponse {
  clearManualMaintenance();
  return json(200, {
    ok: true,
    cleared: true,
    state: getImportMaintenanceState(),
  });
}
