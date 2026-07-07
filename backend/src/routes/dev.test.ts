import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeLogLine } from "../lib/importControl.js";
import { devImportTriggerHandler } from "./dev.js";

test("sanitizeLogLine redacts secret-like values", () => {
  const line = "failed auth api_key=supersecret12345 token=abc123";
  const sanitized = sanitizeLogLine(line);
  assert.equal(sanitized.includes("supersecret12345"), false);
  assert.ok(sanitized.includes("[REDACTED]"));
});

test("devImportTriggerHandler rejects non-dev users", async () => {
  const res = await devImportTriggerHandler(
    {
      method: "POST",
      path: "/api/v1/dev/import/trigger",
      pathname: "/api/v1/dev/import/trigger",
      query: new URLSearchParams(),
      headers: {},
      ipAddress: "127.0.0.1",
      requestId: "req-dev-1",
      rawBody: JSON.stringify({ source: "eros", mode: "pilot" }),
      body: { source: "eros", mode: "pilot" },
      auth: { userId: "user-1", roles: ["member"] },
    },
    {
      prisma: {},
      auditLogger: { append: async () => {} },
    },
  );

  assert.equal(res.statusCode, 403);
});
