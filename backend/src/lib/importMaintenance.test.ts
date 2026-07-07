import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clearImportFlag,
  clearManualMaintenance,
  getImportMaintenanceState,
  guardPublicCatalogMaintenance,
  enrichPublicCatalogResponse,
  writeImportFlag,
  writeManualMaintenance,
} from "./importMaintenance.js";
import type { ApiRequest } from "../types.js";

function withTempDir(run: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbv-import-maint-"));
  const prevFlag = process.env.IMPORT_FLAG_PATH;
  const prevManual = process.env.IMPORT_MANUAL_PATH;
  const prevMode = process.env.IMPORT_MAINTENANCE_MODE;

  process.env.IMPORT_FLAG_PATH = path.join(dir, "import-in-progress");
  process.env.IMPORT_MANUAL_PATH = path.join(dir, "maintenance-manual.json");
  process.env.IMPORT_MAINTENANCE_MODE = "soft";

  try {
    run(dir);
  } finally {
    if (prevFlag === undefined) delete process.env.IMPORT_FLAG_PATH;
    else process.env.IMPORT_FLAG_PATH = prevFlag;
    if (prevManual === undefined) delete process.env.IMPORT_MANUAL_PATH;
    else process.env.IMPORT_MANUAL_PATH = prevManual;
    if (prevMode === undefined) delete process.env.IMPORT_MAINTENANCE_MODE;
    else process.env.IMPORT_MAINTENANCE_MODE = prevMode;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function catalogRequest(pathname: string): ApiRequest {
  return {
    method: "GET",
    path: pathname,
    pathname,
    query: new URLSearchParams(),
    headers: {},
    rawBody: null,
    ipAddress: "127.0.0.1",
    requestId: "req-test-1",
  };
}

test("getImportMaintenanceState inactive when flag absent", () => {
  withTempDir(() => {
    const state = getImportMaintenanceState();
    assert.equal(state.active, false);
    assert.equal(state.importInProgress, false);
  });
});

test("getImportMaintenanceState active when orchestrator flag present", () => {
  withTempDir(() => {
    writeImportFlag({ startedAt: "2026-07-07T05:00:00.000Z", source: "import-orchestrator", phase: "tryst" });
    const state = getImportMaintenanceState();
    assert.equal(state.active, true);
    assert.equal(state.importInProgress, true);
    assert.equal(state.phase, "tryst");
    assert.match(state.banner ?? "", /Catalog updating/);
  });
});

test("guardPublicCatalogMaintenance returns 503 in hard mode", () => {
  withTempDir(() => {
    process.env.IMPORT_MAINTENANCE_MODE = "hard";
    writeImportFlag({ startedAt: "2026-07-07T05:00:00.000Z", phase: "eros-import" });

    const blocked = guardPublicCatalogMaintenance(catalogRequest("/api/v1/search/providers"));
    assert.ok(blocked);
    assert.equal(blocked?.statusCode, 503);
    assert.equal(blocked?.headers?.["retry-after"], "900");
  });
});

test("guardPublicCatalogMaintenance allows requests in soft mode", () => {
  withTempDir(() => {
    writeImportFlag({ startedAt: "2026-07-07T05:00:00.000Z", phase: "tryst" });
    const blocked = guardPublicCatalogMaintenance(catalogRequest("/api/v1/search/providers"));
    assert.equal(blocked, null);
  });
});

test("enrichPublicCatalogResponse adds catalogMaintenance in soft mode", () => {
  withTempDir(() => {
    writeImportFlag({ startedAt: "2026-07-07T05:00:00.000Z", phase: "tryst" });

    const enriched = enrichPublicCatalogResponse(
      { statusCode: 200, body: { items: [] }, headers: {} },
      "/api/v1/search/providers",
    );

    assert.equal(enriched.headers?.["x-catalog-maintenance"], "soft");
    assert.equal((enriched.body as { catalogMaintenance?: { active?: boolean } }).catalogMaintenance?.active, true);
  });
});

test("manual maintenance override works independently of import flag", () => {
  withTempDir(() => {
    writeManualMaintenance({ startedAt: "2026-07-07T05:00:00.000Z", source: "admin", phase: "manual" });
    const state = getImportMaintenanceState();
    assert.equal(state.manualOverride, true);
    assert.equal(state.active, true);

    clearManualMaintenance();
    clearImportFlag();
    assert.equal(getImportMaintenanceState().active, false);
  });
});
