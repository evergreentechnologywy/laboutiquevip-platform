import { z, ZodError } from "zod";
import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import {
  queueImportTrigger,
  readAllImportStatuses,
  readImportLogTail,
  readMaintenanceState,
  writeMaintenanceState,
  type ImportMode,
  type ImportSource,
  type MaintenanceMode,
} from "../lib/importControl.js";

interface DevContext {
  prisma: any;
  auditLogger: AuditLogger;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

function isDevOrAdmin(request: ApiRequest): boolean {
  const roles = request.auth?.roles ?? [];
  return roles.includes("dev") || roles.includes("admin");
}

const triggerSchema = z.object({
  source: z.enum(["eros", "tryst", "orchestrator"]),
  mode: z.enum(["pilot", "full"]).default("pilot"),
});

const maintenanceSchema = z.object({
  mode: z.enum(["off", "soft", "hard"]),
});

export async function devImportStatusHandler(request: ApiRequest, context: DevContext): Promise<ApiResponse> {
  if (!isDevOrAdmin(request)) {
    return json(403, { error: "forbidden", message: "Dev role required" });
  }

  const imports = await readAllImportStatuses();
  const maintenance = await readMaintenanceState();

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "dev.import.status_read",
    resourceType: "import",
    resourceId: null,
    metadata: {},
  });

  return json(200, {
    imports,
    maintenance,
    cron: {
      orchestratorPoll: "* * * * *",
      erosReconcile: "03:30 UTC daily",
      trysImport: "04:00 UTC daily",
    },
  });
}

export async function devImportTriggerHandler(request: ApiRequest, context: DevContext): Promise<ApiResponse> {
  if (!isDevOrAdmin(request)) {
    return json(403, { error: "forbidden", message: "Dev role required" });
  }

  try {
    const payload = triggerSchema.parse(request.body ?? {});
    const result = await queueImportTrigger({
      source: payload.source as ImportSource,
      mode: payload.mode as ImportMode,
      requestedBy: request.auth?.userId ?? null,
    });

    await context.auditLogger.append({
      actorId: request.auth?.userId ?? null,
      action: "dev.import.trigger",
      resourceType: "import",
      resourceId: payload.source,
      metadata: { mode: payload.mode, path: result.path },
    });

    return json(202, {
      ok: true,
      queued: true,
      source: payload.source,
      mode: payload.mode,
      triggerFile: result.path,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return json(400, { error: "validation_error", details: error.flatten() });
    }
    return json(500, { error: "trigger_failed", message: "Could not queue import trigger" });
  }
}

export async function devMaintenanceHandler(request: ApiRequest, context: DevContext): Promise<ApiResponse> {
  if (!isDevOrAdmin(request)) {
    return json(403, { error: "forbidden", message: "Dev role required" });
  }

  try {
    const payload = maintenanceSchema.parse(request.body ?? {});
    const state = await writeMaintenanceState(payload.mode as MaintenanceMode, request.auth?.userId ?? null);

    await context.auditLogger.append({
      actorId: request.auth?.userId ?? null,
      action: "dev.maintenance.set",
      resourceType: "maintenance",
      resourceId: payload.mode,
      metadata: { mode: payload.mode },
    });

    return json(200, { ok: true, maintenance: state });
  } catch (error) {
    if (error instanceof ZodError) {
      return json(400, { error: "validation_error", details: error.flatten() });
    }
    return json(500, { error: "maintenance_failed", message: "Could not update maintenance mode" });
  }
}

export async function devImportLogsHandler(request: ApiRequest, context: DevContext): Promise<ApiResponse> {
  if (!isDevOrAdmin(request)) {
    return json(403, { error: "forbidden", message: "Dev role required" });
  }

  const source = (request.query.get("source") ?? "eros") as ImportSource;
  if (!["eros", "tryst", "orchestrator"].includes(source)) {
    return json(400, { error: "validation_error", message: "source must be eros|tryst|orchestrator" });
  }

  const lines = await readImportLogTail(source, 100);

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "dev.import.logs_read",
    resourceType: "import",
    resourceId: source,
    metadata: { lineCount: lines.length },
  });

  return json(200, { source, lines });
}
