import { z } from "zod";
import type { ApiRequest, ApiResponse } from "../types.js";
import { readEvergreenModelsStatus } from "../lib/evergreenModels.js";
import {
  queueEvergreenSync,
  readLatestEvergreenSyncRequest,
  readEvergreenSyncQueue,
} from "../lib/evergreenSyncQueue.js";
import { readCatalogWorkerStatus } from "../lib/catalogWorkerStatus.js";

const modelLocationSchema = z.object({
  model: z.string().trim().min(1),
  locationCity: z.string().trim().min(1).optional(),
  locationState: z.string().trim().min(1).optional(),
});

const syncBodySchema = z.object({
  model: z.string().trim().min(1).optional(),
  locationCity: z.string().trim().min(1).optional(),
  locationState: z.string().trim().min(1).optional(),
  syncAll: z.boolean().optional(),
  models: z.array(modelLocationSchema).min(1).max(50).optional(),
});

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

function requireServiceRole(request: ApiRequest): ApiResponse | null {
  if (!request.auth?.roles.includes("service")) {
    return json(403, {
      error: "forbidden",
      message: "Service role required for Aura integration",
    });
  }
  return null;
}

export async function auraEvergreenSyncHandler(
  request: ApiRequest,
  _context: unknown,
): Promise<ApiResponse> {
  const denied = requireServiceRole(request);
  if (denied) return denied;

  let body: z.infer<typeof syncBodySchema>;
  try {
    body = syncBodySchema.parse(request.body ?? {});
  } catch (err) {
    return json(400, {
      error: "invalid_body",
      message: err instanceof Error ? err.message : "Invalid evergreen sync body",
      accepted: {
        single: { model: "string", locationCity: "string?", locationState: "string?" },
        batch: {
          models: [{ model: "string", locationCity: "string?", locationState: "string?" }],
        },
        all: { syncAll: true },
      },
    });
  }

  const syncAll = body.syncAll === true || (!body.model?.trim() && !body.models?.length);
  const requestedBy = request.auth?.userId ?? "aura-integration";

  if (body.models?.length) {
    const queued = [];
    for (const entry of body.models) {
      queued.push(
        await queueEvergreenSync({
          mode: "single",
          model: entry.model.trim(),
          locationCity: entry.locationCity ?? null,
          locationState: entry.locationState ?? null,
          requestedBy,
        }),
      );
    }
    return json(202, {
      ok: true,
      mode: "batch",
      queued: true,
      count: queued.length,
      requestIds: queued.map((row) => row.id),
      models: queued.map((row) => ({
        requestId: row.id,
        model: row.model,
        locationCity: row.locationCity,
        locationState: row.locationState,
      })),
      message:
        "Evergreen roster accepted. Aura worker should publish each model via POST /api/v1/catalog/ingest with source=evergreen.",
      worker_hook: "evergreen-sync-queue.json",
    });
  }

  if (syncAll) {
    const queued = await queueEvergreenSync({
      mode: "all",
      requestedBy,
    });
    return json(202, {
      ok: true,
      mode: "all",
      queued: true,
      requestId: queued.id,
      message:
        "Evergreen sync accepted. Aura worker should process the queue and publish via catalog ingest.",
      worker_hook: "evergreen-sync-queue.json",
    });
  }

  const queued = await queueEvergreenSync({
    mode: "single",
    model: body.model!.trim(),
    locationCity: body.locationCity ?? null,
    locationState: body.locationState ?? null,
    requestedBy,
  });

  return json(202, {
    ok: true,
    mode: "single",
    queued: true,
    requestId: queued.id,
    model: body.model!.trim(),
    locationCity: body.locationCity ?? null,
    locationState: body.locationState ?? null,
    message:
      "Evergreen model sync accepted. Aura worker should process the queue and publish via catalog ingest.",
    worker_hook: "evergreen-sync-queue.json",
  });
}

export async function auraEvergreenStatusHandler(
  request: ApiRequest,
  _context: unknown,
): Promise<ApiResponse> {
  const denied = requireServiceRole(request);
  if (denied) return denied;

  const [evergreenModels, syncQueue, latestSync, catalogWorkers] = await Promise.all([
    readEvergreenModelsStatus(),
    readEvergreenSyncQueue(),
    readLatestEvergreenSyncRequest(),
    readCatalogWorkerStatus().catch(() => ({})),
  ]);

  const workerMap = catalogWorkers as Record<string, { state?: string; phase?: string; updatedAt?: string; message?: string }>;

  return json(200, {
    ok: true,
    evergreenModels,
    syncQueue: {
      pending: syncQueue.filter((entry) => entry.state === "queued").length,
      latest: latestSync,
      recent: syncQueue.slice(-10),
    },
    catalogWorkers: workerMap.evergreen ?? workerMap.all ?? null,
  });
}
