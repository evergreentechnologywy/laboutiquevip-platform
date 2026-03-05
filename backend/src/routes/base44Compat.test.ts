import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { authFromHeaders } from "../auth.js";
import { createEntityHandler, updateProviderHandler } from "./base44Compat.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";

function makeReq(overrides: any = {}): any {
  return {
    method: "POST",
    path: "/",
    pathname: "/",
    query: new URLSearchParams(),
    headers: {},
    ipAddress: "127.0.0.1",
    requestId: "req-1",
    rawBody: null,
    auth: { userId: "user-1", roles: ["member"] },
    body: {},
    ...overrides,
  };
}

test("authFromHeaders accepts valid HS256 JWT with sub/role", () => {
  const token = jwt.sign({ sub: "user-123", role: "admin" }, JWT_SECRET, { algorithm: "HS256", expiresIn: "1h" });
  const auth = authFromHeaders({ authorization: `Bearer ${token}` });
  assert.equal(auth.userId, "user-123");
  assert.deepEqual(auth.roles, ["admin"]);
});

test("authFromHeaders rejects invalid JWT", () => {
  const auth = authFromHeaders({ authorization: "Bearer invalid.token.here" });
  assert.equal(auth.userId, null);
  assert.deepEqual(auth.roles, []);
});

test("Provider create denied when non-admin creates for different owner", async () => {
  const prisma = { provider: { create: async () => ({ id: "p1" }) } };
  const res = await createEntityHandler(
    makeReq({
      body: { user_id: "00000000-0000-0000-0000-000000000999", display_name: "X" },
      auth: { userId: "00000000-0000-0000-0000-000000000111", roles: ["member"] },
    }),
    "Provider",
    { prisma },
  );
  assert.equal(res.statusCode, 403);
});

test("Review create requires auth", async () => {
  const prisma = { review: { create: async () => ({ id: "r1" }) } };
  const res = await createEntityHandler(
    makeReq({
      auth: { userId: null, roles: [] },
      body: { provider_id: "00000000-0000-0000-0000-000000000111", rating: 5, comment: "Great", reviewer_name: "A" },
    }),
    "Review",
    { prisma },
  );
  assert.equal(res.statusCode, 401);
});

test("Provider update denied for non-owner non-admin", async () => {
  const prisma = {
    provider: {
      findUnique: async () => ({ id: "p1", user_id: "owner-1" }),
      update: async () => ({ id: "p1" }),
    },
  };
  const res = await updateProviderHandler(
    makeReq({ auth: { userId: "attacker", roles: ["member"] }, body: { display_name: "Nope" } }),
    "p1",
    { prisma },
  );
  assert.equal(res.statusCode, 403);
});
