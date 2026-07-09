import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { BodyTooLargeError, MAX_JSON_BODY_BYTES, MAX_WEBHOOK_BODY_BYTES, readBody } from "./readBody.js";

function makeReq(
  method: string,
  body: string,
  pathname: string,
  contentType = "application/json",
): IncomingMessage {
  const stream = Readable.from([Buffer.from(body, "utf8")]);
  return Object.assign(stream, {
    method,
    headers: { "content-type": contentType },
  }) as IncomingMessage;
}

test("readBody rejects JSON payloads above the default limit", async () => {
  const oversized = "a".repeat(MAX_JSON_BODY_BYTES + 1);
  await assert.rejects(
    () => readBody(makeReq("POST", oversized, "/api/v1/orders"), "/api/v1/orders"),
    (error: unknown) => error instanceof BodyTooLargeError,
  );
});

test("readBody applies a stricter limit for webhook routes", async () => {
  const oversized = "a".repeat(MAX_WEBHOOK_BODY_BYTES + 1);
  await assert.rejects(
    () => readBody(makeReq("POST", oversized, "/api/v1/webhooks/nowpayments"), "/api/v1/webhooks/nowpayments"),
    (error: unknown) => error instanceof BodyTooLargeError,
  );
});

test("readBody parses valid JSON within the limit", async () => {
  const payload = await readBody(makeReq("POST", '{"ok":true}', "/api/v1/orders"), "/api/v1/orders");
  assert.deepEqual(payload.body, { ok: true });
  assert.equal(payload.rawBody, '{"ok":true}');
});
