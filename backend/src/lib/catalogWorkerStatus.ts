import fs from "node:fs/promises";
import path from "node:path";
import { triggerDir } from "./importControl.js";

export type CatalogWorkerSource = "eros" | "tryst" | "merge" | "scan" | "all";

export interface CatalogWorkerStatusPayload {
  source: CatalogWorkerSource | string;
  state: "idle" | "running" | "ok" | "failed" | string;
  phase?: string | null;
  message?: string | null;
  counts?: Record<string, number> | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  host?: string | null;
  updatedAt?: string;
  [key: string]: unknown;
}

function statusPath(): string {
  return path.join(triggerDir(), "catalog-worker-status.json");
}

export async function readCatalogWorkerStatus(): Promise<Record<string, CatalogWorkerStatusPayload>> {
  try {
    const raw = await fs.readFile(statusPath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, CatalogWorkerStatusPayload>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // empty
  }
  return {};
}

export async function writeCatalogWorkerStatus(
  entry: CatalogWorkerStatusPayload,
): Promise<CatalogWorkerStatusPayload> {
  const dir = triggerDir();
  await fs.mkdir(dir, { recursive: true });
  const all = await readCatalogWorkerStatus();
  const key = String(entry.source || "all");
  const updatedAt = new Date().toISOString();
  const next: CatalogWorkerStatusPayload = {
    ...all[key],
    ...entry,
    source: key,
    updatedAt,
  };
  all[key] = next;
  const tmp = `${statusPath()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  await fs.rename(tmp, statusPath());
  return next;
}
