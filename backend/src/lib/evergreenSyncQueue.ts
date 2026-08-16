import fs from "node:fs/promises";
import path from "node:path";
import { triggerDir } from "./importControl.js";

export interface EvergreenSyncRequest {
  id: string;
  mode: "single" | "all";
  model?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
  state: "queued" | "running" | "completed" | "failed";
  requestedAt: string;
  requestedBy: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
}

function queuePath(): string {
  return path.join(triggerDir(), "evergreen-sync-queue.json");
}

async function readQueueFile(): Promise<EvergreenSyncRequest[]> {
  try {
    const raw = await fs.readFile(queuePath(), "utf8");
    const parsed = JSON.parse(raw) as EvergreenSyncRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueueFile(entries: EvergreenSyncRequest[]): Promise<void> {
  const dir = triggerDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${queuePath()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  await fs.rename(tmp, queuePath());
}

function newRequestId(): string {
  return `eg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function queueEvergreenSync(input: {
  mode: "single" | "all";
  model?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
  requestedBy: string | null;
}): Promise<EvergreenSyncRequest> {
  const entry: EvergreenSyncRequest = {
    id: newRequestId(),
    mode: input.mode,
    model: input.model ?? null,
    locationCity: input.locationCity ?? null,
    locationState: input.locationState ?? null,
    state: "queued",
    requestedAt: new Date().toISOString(),
    requestedBy: input.requestedBy,
  };

  const queue = await readQueueFile();
  queue.push(entry);
  // Keep recent history for status; trim to last 50 entries.
  const trimmed = queue.slice(-50);
  await writeQueueFile(trimmed);
  return entry;
}

export async function readEvergreenSyncQueue(): Promise<EvergreenSyncRequest[]> {
  return readQueueFile();
}

export async function readLatestEvergreenSyncRequest(): Promise<EvergreenSyncRequest | null> {
  const queue = await readQueueFile();
  return queue.length ? queue[queue.length - 1]! : null;
}
