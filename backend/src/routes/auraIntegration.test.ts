import test from "node:test";
import assert from "node:assert/strict";
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

test("auraEvergreenSyncHandler denies non-service roles", async () => {
  const response = await auraEvergreenSyncHandler(
    makeRequest({ auth: { userId: "user-1", roles: ["member"] } }),
    {} as any,
  );
  assert.equal(response.statusCode, 403);
});

test("auraEvergreenStatusHandler returns status for service role", async () => {
  const response = await auraEvergreenStatusHandler(makeRequest(), {} as any);
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as any).ok, true);
  assert.ok((response.body as any).evergreenModels);
});
