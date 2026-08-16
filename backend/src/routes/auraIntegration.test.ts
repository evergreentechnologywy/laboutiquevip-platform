import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auraEvergreenStatusHandler,
  auraEvergreenSyncHandler,
} from "./auraIntegration.js";

function makeRequest(overrides: Record<string, unknown> = {}): any {
  return {
    method: "POST",
    path: "/api/v1/integrations/aura/evergreen-sync",
    pathname: "/api/v1/integrations/aura/evergreen-sync",
    query: new URLSearchParams(),
    headers: {},
    ipAddress: "127.0.0.1",
    requestId: "req-aura-1",
    rawBody: null,
    auth: { userId: "aura-service", roles: ["service"] },
    body: {},
    ...overrides,
  };
}

function withTriggerDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbv-evergreen-sync-"));
  const previous = process.env.LBV_TRIGGER_DIR;
  process.env.LBV_TRIGGER_DIR = dir;
  return fn().finally(() => {
    if (previous === undefined) delete process.env.LBV_TRIGGER_DIR;
    else process.env.LBV_TRIGGER_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test("auraEvergreenSyncHandler denies non-service roles", async () => {
  const response = await auraEvergreenSyncHandler(
    makeRequest({ auth: { userId: "user-1", roles: ["member"] } }),
    {} as any,
  );
  assert.equal(response.statusCode, 403);
});

test("auraEvergreenSyncHandler queues syncAll with 202", async () => {
  await withTriggerDir(async () => {
    const response = await auraEvergreenSyncHandler(
      makeRequest({ body: { syncAll: true } }),
      {} as any,
    );
    assert.equal(response.statusCode, 202);
    const body = response.body as any;
    assert.equal(body.ok, true);
    assert.equal(body.mode, "all");
    assert.equal(body.queued, true);
    assert.ok(body.requestId);
  });
});

test("auraEvergreenSyncHandler queues single model with 202", async () => {
  await withTriggerDir(async () => {
    const response = await auraEvergreenSyncHandler(
      makeRequest({
        body: {
          model: "Sofia",
          locationCity: "Denver",
          locationState: "CO",
        },
      }),
      {} as any,
    );
    assert.equal(response.statusCode, 202);
    const body = response.body as any;
    assert.equal(body.ok, true);
    assert.equal(body.mode, "single");
    assert.equal(body.model, "Sofia");
    assert.equal(body.locationCity, "Denver");
    assert.equal(body.locationState, "CO");
    assert.ok(body.requestId);
  });
});

test("auraEvergreenSyncHandler queues calendar roster batch with cities", async () => {
  await withTriggerDir(async () => {
    const response = await auraEvergreenSyncHandler(
      makeRequest({
        body: {
          models: [
            { model: "Alice", locationCity: "Memphis", locationState: "TN" },
            { model: "Bea", locationCity: "Norfolk", locationState: "VA" },
          ],
        },
      }),
      {} as any,
    );
    assert.equal(response.statusCode, 202);
    const body = response.body as any;
    assert.equal(body.mode, "batch");
    assert.equal(body.count, 2);
    assert.equal(body.models[0].locationCity, "Memphis");
    assert.equal(body.models[1].locationCity, "Norfolk");
  });
});

test("auraEvergreenStatusHandler returns status for service role", async () => {
  await withTriggerDir(async () => {
    const response = await auraEvergreenStatusHandler(makeRequest(), {} as any);
    assert.equal(response.statusCode, 200);
    assert.equal((response.body as any).ok, true);
    assert.ok((response.body as any).evergreenModels);
    assert.ok((response.body as any).syncQueue);
  });
});
