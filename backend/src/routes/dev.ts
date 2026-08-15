import { z, ZodError } from "zod";
import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import {
  queueImportTrigger,
  readAllImportStatuses,
  readImportLogTail,
  readMaintenanceState,
  sanitizeLogLine,
  writeMaintenanceState,
  type ImportMode,
  type ImportSource,
  type MaintenanceMode,
} from "../lib/importControl.js";
import {
  MERGE_PHASES,
  readCatalogLogTail,
  readCatalogPipelineStatus,
  type CatalogLogSource,
} from "../lib/catalogPipeline.js";
import { readEvergreenModelsStatus, readEvergreenLogTail } from "../lib/evergreenModels.js";
import { readCatalogWorkerStatus } from "../lib/catalogWorkerStatus.js";

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
  source: z.enum(["eros", "tryst", "orchestrator", "evergreen"]),
  mode: z.enum(["pilot", "full"]).default("pilot"),
});

const maintenanceSchema = z.object({
  mode: z.enum(["off", "soft", "hard"]),
});

export async function devImportStatusHandler(request: ApiRequest, context: DevContext): Promise<ApiResponse> {
  if (!isDevOrAdmin(request)) {
    return json(403, { error: "forbidden", message: "Dev role required" });
  }

  const [imports, maintenance, catalogPipeline, activeEvergreen, eliteActive, catalogWorkers] =
    await Promise.all([
      readAllImportStatuses(),
      readMaintenanceState(),
      readCatalogPipelineStatus(),
      context.prisma.provider
        .count({ where: { status: "active", verification_provider: "evergreen" } })
        .catch(() => null),
      context.prisma.provider.count({ where: { status: "active", ad_package: "elite" } }).catch(() => null),
      readCatalogWorkerStatus().catch(() => ({})),
    ]);

  const evergreenStatus = await readEvergreenModelsStatus(
    activeEvergreen != null && eliteActive != null
      ? { activeEvergreen, eliteActive }
      : null,
  );

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
    catalogPipeline,
    evergreenModels: evergreenStatus,
    catalogWorkers,
    mergePhases: MERGE_PHASES,
    cron: catalogPipeline.schedule,
    catalogBoundary: {
      mode: "api_only",
      localTriggersAllowed: ["evergreen"],
      externalSources: ["eros", "tryst"],
      ingest: "POST /api/v1/catalog/ingest",
      workerStatus: "POST|GET /api/v1/catalog/worker-status",
      auraEvergreenSync: "POST /api/v1/integrations/aura/evergreen-sync",
      note: "Eros/Tryst scan+import run from Aura/lbv-catalog-workers and post via API.",
    },
  });
}

export async function devImportTriggerHandler(request: ApiRequest, context: DevContext): Promise<ApiResponse> {
  if (!isDevOrAdmin(request)) {
    return json(403, { error: "forbidden", message: "Dev role required" });
  }

  try {
    const payload = triggerSchema.parse(request.body ?? {});

    // Production boundary: Eros/Tryst/orchestrator scrapes are external (Aura workers + catalog API).
    if (payload.source === "eros" || payload.source === "tryst" || payload.source === "orchestrator") {
      await context.auditLogger.append({
        actorId: request.auth?.userId ?? null,
        action: "dev.import.trigger_rejected_external",
        resourceType: "import",
        resourceId: payload.source,
        metadata: { mode: payload.mode },
      });
      return json(410, {
        ok: false,
        queued: false,
        error: "source_moved_external",
        source: payload.source,
        message:
          "Eros/Tryst imports no longer run inside LBV production. Use Aura catalog workers → POST /api/v1/catalog/ingest.",
        ingest_path: "/api/v1/catalog/ingest",
        worker_home: "/root/calendar-coordinator/scripts/lbv-catalog",
      });
    }

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

  const sourceParam = request.query.get("source") ?? "scan";
  const catalogSources: CatalogLogSource[] = ["scan", "merge", "evergreen", "eros", "tryst", "orchestrator"];
  let lines: string[];

  if (sourceParam === "evergreen") {
    lines = (await readEvergreenLogTail(100)).map(sanitizeLogLine);
  } else if (catalogSources.includes(sourceParam as CatalogLogSource)) {
    lines = (await readCatalogLogTail(sourceParam as CatalogLogSource, 100)).map(sanitizeLogLine);
  } else if (["eros", "tryst", "orchestrator"].includes(sourceParam)) {
    lines = await readImportLogTail(sourceParam as ImportSource, 100);
  } else {
    return json(400, {
      error: "validation_error",
      message: "source must be scan|merge|evergreen|eros|tryst|orchestrator",
    });
  }

  const source = sourceParam;

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "dev.import.logs_read",
    resourceType: "import",
    resourceId: source,
    metadata: { lineCount: lines.length },
  });

  return json(200, { source, lines });
}
