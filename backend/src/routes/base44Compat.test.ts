import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { authFromHeaders } from "../auth.js";
import { setUploadStorageForTests } from "../storage/uploads.js";
import { createEntityHandler, listOrFilterEntityHandler, updateProviderHandler, uploadHandler } from "./base44Compat.js";

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

test.afterEach(() => {
  setUploadStorageForTests(null);
});

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

test("Provider owner cannot self-assign paid package fields", async () => {
  let seenData: any = null;
  const prisma = {
    provider: {
      findUnique: async () => ({
        id: "p1",
        user_id: "owner-1",
        is_profile_approved: true,
        status: "active",
        ad_package: "none",
        ad_package_expiry: null,
        ad_package_started_at: null,
        ad_package_expiration_reminder_sent_at: null,
        is_premium: false,
      }),
      update: async ({ data }: any) => {
        seenData = data;
        return { id: "p1", ...data };
      },
    },
  };

  const res = await updateProviderHandler(
    makeReq({
      auth: { userId: "owner-1", roles: ["member"] },
      body: {
        display_name: "Owner Listing",
        ad_package: "premium",
        ad_package_expiry: "2099-01-01",
        ad_package_started_at: "2098-01-01T00:00:00.000Z",
        ad_package_expiration_reminder_sent_at: "2098-12-30T00:00:00.000Z",
        is_premium: true,
      },
    }),
    "p1",
    { prisma },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(seenData.display_name, "Owner Listing");
  assert.equal(seenData.ad_package, "none");
  assert.equal(seenData.ad_package_expiry, null);
  assert.equal(seenData.ad_package_started_at, null);
  assert.equal(seenData.ad_package_expiration_reminder_sent_at, null);
  assert.equal(seenData.is_premium, false);
});

test("Provider owner can pause an approved listing", async () => {
  const prisma = {
    provider: {
      findUnique: async () => ({ id: "p1", user_id: "owner-1", is_profile_approved: true, status: "active", ad_package: "none" }),
      update: async ({ data }: any) => ({ id: "p1", ...data }),
    },
  };
  const res = await updateProviderHandler(
    makeReq({ auth: { userId: "owner-1", roles: ["member"] }, body: { status: "paused" } }),
    "p1",
    { prisma },
  );
  assert.equal(res.statusCode, 200);
  assert.equal((res.body as any).status, "paused");
});

test("Provider owner cannot pause an unapproved listing", async () => {
  const prisma = {
    provider: {
      findUnique: async () => ({ id: "p1", user_id: "owner-1", is_profile_approved: false, status: "pending_verification", ad_package: "none" }),
      update: async ({ data }: any) => ({ id: "p1", ...data }),
    },
  };
  const res = await updateProviderHandler(
    makeReq({ auth: { userId: "owner-1", roles: ["member"] }, body: { status: "paused" } }),
    "p1",
    { prisma },
  );
  assert.equal(res.statusCode, 200);
  assert.equal((res.body as any).status, "pending_verification");
});

test("Admin can approve a provider and keep moderation fields", async () => {
  let seenData: any = null;
  const prisma = {
    provider: {
      findUnique: async () => ({
        id: "p1",
        user_id: "owner-1",
        is_profile_approved: false,
        status: "pending_verification",
        ad_package: "premium",
        photos: ["existing-photo"],
        pending_photos: ["pending-photo"],
        verification_documents: ["doc-1"],
      }),
      update: async ({ data }: any) => {
        seenData = data;
        return { id: "p1", ...data };
      },
    },
  };

  const res = await updateProviderHandler(
    makeReq({
      auth: { userId: "admin-1", roles: ["admin"] },
      body: {
        status: "active",
        is_verified: true,
        is_profile_approved: true,
        admin_notes: "approved",
      },
    }),
    "p1",
    { prisma },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(seenData.status, "active");
  assert.equal(seenData.is_verified, true);
  assert.equal(seenData.is_profile_approved, true);
  assert.equal(seenData.admin_notes, "approved");
  assert.equal(seenData.is_premium, true);
  assert.deepEqual(seenData.photos, ["existing-photo"]);
  assert.deepEqual(seenData.pending_photos, ["pending-photo"]);
  assert.deepEqual(seenData.verification_documents, ["doc-1"]);
});

test("Public provider reads apply the blocked-name guardrail", async () => {
  let seenWhere: any = null;
  let seenSelect: any = null;
  const prisma = {
    provider: {
      findMany: async ({ where, select }: any) => {
        seenWhere = where;
        seenSelect = select;
        return [];
      },
    },
  };

  const req = makeReq({
    method: "GET",
    auth: { userId: null, roles: [] },
    query: new URLSearchParams({
      where: JSON.stringify({ id: "p1" }),
    }),
  });

  const res = await listOrFilterEntityHandler(req, "Provider", { prisma });
  assert.equal(res.statusCode, 200);
  assert.equal(seenWhere.AND.length, 2);
  assert.equal(seenWhere.AND[0].status, "active");
  assert.equal(seenWhere.AND[0].is_profile_approved, true);
  assert.ok(Array.isArray(seenWhere.AND[0].NOT));
  assert.deepEqual(seenWhere.AND[1], { id: "p1" });
  assert.equal(seenSelect.phone, true);
  assert.equal(seenSelect.email, true);
  assert.equal(seenSelect.verification_provider, true);
  assert.equal(seenSelect.verification_url, true);
  assert.equal(seenSelect.review_provider, true);
  assert.equal(seenSelect.review_url, true);
});

test("Provider owner can self-preview a non-public profile by id", async () => {
  let seenWhere: any = null;
  const prisma = {
    provider: {
      findMany: async ({ where }: any) => {
        seenWhere = where;
        return [{ id: "p1", user_id: "owner-1", status: "pending_verification" }];
      },
    },
  };

  const req = makeReq({
    method: "GET",
    auth: { userId: "owner-1", roles: ["member"] },
    query: new URLSearchParams({
      where: JSON.stringify({ id: "p1" }),
    }),
  });

  const res = await listOrFilterEntityHandler(req, "Provider", { prisma });
  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body), true);
  assert.equal((res.body as any[]).length, 1);
  assert.equal(seenWhere.AND.length, 2);
  assert.deepEqual(seenWhere.AND[0].OR[0], { user_id: "owner-1" });
  assert.equal(seenWhere.AND[0].OR[1].status, "active");
  assert.equal(seenWhere.AND[0].OR[1].is_profile_approved, true);
  assert.ok(Array.isArray(seenWhere.AND[0].OR[1].NOT));
  assert.deepEqual(seenWhere.AND[1], { id: "p1" });
});

test("Verification reads are scoped to the authenticated user", async () => {
  let seenWhere: any = null;
  const prisma = {
    verification: {
      findMany: async ({ where }: any) => {
        seenWhere = where;
        return [{ id: "v1", userId: "user-1", status: "approved" }];
      },
    },
  };

  const req = makeReq({
    method: "GET",
    auth: { userId: "user-1", roles: ["member"] },
    query: new URLSearchParams({
      where: JSON.stringify({ id: "v1" }),
    }),
  });

  const res = await listOrFilterEntityHandler(req, "Verification", { prisma });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(seenWhere, {
    AND: [
      { userId: "user-1" },
      { id: "v1" },
    ],
  });
});

test("Upload requires an authenticated user", async () => {
  const res = await uploadHandler(
    makeReq({
      auth: { userId: null, roles: [] },
      body: {
        filename: "id.png",
        contentType: "image/png",
        data: "data:image/png;base64,aGVsbG8=",
      },
    }),
  );

  assert.equal(res.statusCode, 401);
});

test("Upload returns local file url when using local storage", async () => {
  let uploaded: any = null;
  setUploadStorageForTests({
    kind: "local",
    servesLocalUploads: true,
    async upload(params) {
      uploaded = params;
      return { fileUrl: "/uploads/local-file.png", storageKey: "local-file.png" };
    },
  });

  const res = await uploadHandler(
    makeReq({
      body: {
        filename: "id.png",
        contentType: "image/png",
        data: "data:image/png;base64,aGVsbG8=",
      },
    }),
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(uploaded, {
    filename: "id.png",
    contentType: "image/png",
    fileBuffer: Buffer.from("hello"),
  });
  assert.equal((res.body as any).file_url, "/uploads/local-file.png");
});

test("Upload can return an absolute S3 url", async () => {
  setUploadStorageForTests({
    kind: "s3",
    servesLocalUploads: false,
    async upload() {
      return {
        fileUrl: "https://cdn.example.com/provider-photos/file.png",
        storageKey: "provider-photos/file.png",
      };
    },
  });

  const res = await uploadHandler(
    makeReq({
      body: {
        filename: "id.png",
        contentType: "image/png",
        data: "data:image/png;base64,aGVsbG8=",
      },
    }),
  );

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as any).file_url, "https://cdn.example.com/provider-photos/file.png");
});
