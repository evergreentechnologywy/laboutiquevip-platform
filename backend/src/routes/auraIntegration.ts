import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import type { ApiRequest, ApiResponse } from "../types.js";
import { queueImportTrigger, readImportStatus } from "../lib/importControl.js";
import { readEvergreenModelsStatus } from "../lib/evergreenModels.js";

const syncBodySchema = z.object({
  model: z.string().trim().min(1).optional(),
  locationCity: z.string().trim().min(1).optional(),
  locationState: z.string().trim().min(1).optional(),
  syncAll: z.boolean().optional(),
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

function repoRoot(): string {
  return process.env.LBV_REPO_DIR?.trim() || path.resolve(process.cwd(), "..");
}

function spawnSingleModelImport(args: {
  model: string;
  locationCity?: string;
  locationState?: string;
}): { pid: number | undefined; script: string; args: string[] } {
  const root = repoRoot();
  const script = path.join(root, "scripts", "import-evergreen-models.mjs");
  const argv = [script, `--model=${args.model}`];
  if (args.locationCity) argv.push(`--location-city=${args.locationCity}`);
  if (args.locationState) argv.push(`--location-state=${args.locationState}`);

  const child = spawn(process.execPath, argv, {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  return { pid: child.pid, script, args: argv };
}

export async function auraEvergreenSyncHandler(
  request: ApiRequest,
  _context: unknown,
): Promise<ApiResponse> {
  const denied = requireServiceRole(request);
  if (denied) return denied;

  const body = syncBodySchema.parse(request.body ?? {});
  const syncAll = body.syncAll === true || !body.model?.trim();

  if (!syncAll && body.model) {
    const spawned = spawnSingleModelImport({
      model: body.model.trim(),
      locationCity: body.locationCity,
      locationState: body.locationState,
    });
    return json(202, {
      ok: true,
      mode: "inline",
      model: body.model.trim(),
      pid: spawned.pid ?? null,
      locationCity: body.locationCity ?? null,
      locationState: body.locationState ?? null,
    });
  }

  const queued = await queueImportTrigger({
    source: "evergreen",
    mode: "full",
    requestedBy: request.auth?.userId ?? "aura-integration",
  });

  return json(202, {
    mode: "queued",
    ...queued,
  });
}

export async function auraEvergreenStatusHandler(
  request: ApiRequest,
  _context: unknown,
): Promise<ApiResponse> {
  const denied = requireServiceRole(request);
  if (denied) return denied;

  const [importStatus, evergreenModels] = await Promise.all([
    readImportStatus("evergreen"),
    readEvergreenModelsStatus(),
  ]);

  return json(200, {
    ok: true,
    importStatus,
    evergreenModels,
  });
}
