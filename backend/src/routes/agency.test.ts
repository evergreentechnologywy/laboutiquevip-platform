import test from "node:test";
import assert from "node:assert/strict";
import {
  createAgencyProfileHandler,
  listAgencyProfilesHandler,
} from "./agency.js";

function makeRequest(overrides: Record<string, unknown> = {}): any {
  return {
    method: "GET",
    path: "/api/v1/agency/profiles",
    pathname: "/api/v1/agency/profiles",
    query: new URLSearchParams(),
    headers: {},
    ipAddress: "127.0.0.1",
    requestId: "req-agency-1",
    rawBody: null,
    auth: { userId: "11111111-1111-4111-8111-111111111111", roles: ["agency"] },
    body: undefined,
    ...overrides,
  };
}

test("listAgencyProfilesHandler denies non-agency roles", async () => {
  const response = await listAgencyProfilesHandler(
    makeRequest({ auth: { userId: "member-1", roles: ["member"] } }),
    {
      prisma: {},
      auditLogger: { append: async () => undefined },
    } as any,
  );

  assert.equal(response.statusCode, 403);
  assert.equal((response.body as any).error, "forbidden");
});

test("listAgencyProfilesHandler requires approved agency status", async () => {
  const response = await listAgencyProfilesHandler(makeRequest(), {
    prisma: {
      user: {
          findUnique: async () => ({ id: "11111111-1111-4111-8111-111111111111", role: "agency", status: "pending_review" }),
      },
    },
    auditLogger: { append: async () => undefined },
  } as any);

  assert.equal(response.statusCode, 403);
  assert.match(String((response.body as any).message), /approved/i);
});

test("createAgencyProfileHandler creates owned provider profile", async () => {
  let createdData: any = null;

  const response = await createAgencyProfileHandler(
    makeRequest({
      method: "POST",
      body: {
        display_name: "Agency Managed Profile",
        location_city: "Miami",
        location_state: "Florida",
      },
    }),
    {
      prisma: {
        user: {
          findUnique: async () => ({ id: "11111111-1111-4111-8111-111111111111", role: "agency", status: "active" }),
        },
        provider: {
          create: async ({ data }: any) => {
            createdData = data;
            return { id: "provider-1", ...data };
          },
        },
      },
      auditLogger: { append: async () => undefined },
    } as any,
  );

  assert.equal(response.statusCode, 201);
  assert.equal(createdData.user_id, "11111111-1111-4111-8111-111111111111");
  assert.equal((response.body as any).display_name, "Agency Managed Profile");
});
