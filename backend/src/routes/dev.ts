import { z, ZodError } from "zod";
import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import {
  readAllImportStatuses,
  readImportLogTail,
  readMaintenanceState,
  sanitizeLogLine,
  writeMaintenanceState,
  type ImportSource,
  type MaintenanceMode,
} from "../lib/importControl.js";
import {
  MERGE_PHASES,
  readCatalogLogTail,
  readCatalogPipelineStatus,
  type CatalogLogSource,
} from "../lib/catalogPipeline.js";
import { readEvergreenModelsStatus } from "../lib/evergreenModels.js";
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
      localTriggersAllowed: [],
      externalSources: ["eros", "tryst", "evergreen"],
      ingest: "POST /api/v1/catalog/ingest",
      workerStatus: "POST|GET /api/v1/catalog/worker-status",
      auraEvergreenSync: "POST /api/v1/integrations/aura/evergreen-sync",
      note: "Scan, vet, scrape, and import run on Aura (calendar-coordinator). LBV accepts API posts only.",
    },
  });
}

export async function devImportTriggerHandler(request: ApiRequest, context: DevContext): Promise<ApiResponse> {
  if (!isDevOrAdmin(request)) {
    return json(403, { error: "forbidden", message: "Dev role required" });
  }

  try {
    const payload = triggerSchema.parse(request.body ?? {});

    // Production boundary: all scan/scrape/import runs on Aura; LBV accepts API posts only.
    await context.auditLogger.append({
      actorId: request.auth?.userId ?? null,
      action: "dev.import.trigger_rejected_external",
      resourceType: "import",
      resourceId: payload.source,
      metadata: { mode: payload.mode },
    });

    const evergreenHint =
      payload.source === "evergreen"
        ? "POST /api/v1/integrations/aura/evergreen-sync"
        : "POST /api/v1/catalog/ingest";

    return json(410, {
      ok: false,
      queued: false,
      error: "source_moved_external",
      source: payload.source,
      message:
        "Scan, vet, scrape, and import no longer run inside LBV production. Use Aura workers and the catalog/evergreen APIs.",
      ingest_path: "/api/v1/catalog/ingest",
      evergreen_sync_path: "/api/v1/integrations/aura/evergreen-sync",
      api_path: evergreenHint,
      worker_home: "/root/calendar-coordinator/scripts/lbv-catalog",
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

  if (catalogSources.includes(sourceParam as CatalogLogSource)) {
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
