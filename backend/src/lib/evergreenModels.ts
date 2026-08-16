import { readLatestEvergreenSyncRequest } from "./evergreenSyncQueue.js";

export interface EvergreenModelsStatus {
  autoSync: {
    enabled: boolean;
    schedule: string;
    note: string;
  };
  catalog: {
    activeEvergreenProviders: number | null;
    eliteProviders: number | null;
  };
  lastSyncRequest: {
    id: string | null;
    mode: string | null;
    model: string | null;
    state: string | null;
    requestedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  };
  boundary: {
    publishPath: string;
    syncPath: string;
    workerHome: string;
    note: string;
  };
}

export async function readEvergreenModelsStatus(
  dbCounts?: { activeEvergreen: number; eliteActive: number } | null,
): Promise<EvergreenModelsStatus> {
  const latest = await readLatestEvergreenSyncRequest();

  return {
    autoSync: {
      enabled: true,
      schedule: "Aura calendar-coordinator (Hermes) — external worker",
      note: "Evergreen roster sync runs on Aura; LBV accepts API posts only.",
    },
    catalog: {
      activeEvergreenProviders: dbCounts?.activeEvergreen ?? null,
      eliteProviders: dbCounts?.eliteActive ?? null,
    },
    lastSyncRequest: {
      id: latest?.id ?? null,
      mode: latest?.mode ?? null,
      model: latest?.model ?? null,
      state: latest?.state ?? null,
      requestedAt: latest?.requestedAt ?? null,
      finishedAt: latest?.finishedAt ?? null,
      error: latest?.error ?? null,
    },
    boundary: {
      publishPath: "POST /api/v1/catalog/ingest",
      syncPath: "POST /api/v1/integrations/aura/evergreen-sync",
      workerHome: "/root/calendar-coordinator/scripts/lbv-catalog",
      note: "SiteConsole and model profiles are read by Aura workers, not LBV production.",
    },
  };
}
