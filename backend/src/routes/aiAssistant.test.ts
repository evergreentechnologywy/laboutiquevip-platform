import test from "node:test";
import assert from "node:assert/strict";
import { aiAssistantHandler, applyAiTourDraftHandler } from "./aiAssistant.js";

function makeRequest(body: Record<string, unknown>, auth: any = { userId: null, roles: [] }): any {
  return {
    method: "POST",
    path: "/api/v1/ai/assistant",
    pathname: "/api/v1/ai/assistant",
    query: new URLSearchParams(),
    headers: {},
    ipAddress: "127.0.0.1",
    requestId: "req-ai-1",
    rawBody: JSON.stringify(body),
    auth,
    body,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}): any {
  return {
    user: {
      findUnique: async () => null,
    },
    provider: {
      findFirst: async () => null,
      count: async () => 0,
    },
    providerProfile: {
      count: async () => 0,
    },
    providerTour: {
      findMany: async () => [],
    },
    order: {
      findMany: async () => [],
    },
    ...overrides,
  };
}

test("aiAssistantHandler serves limited registration guidance to guests", async () => {
  const response = await aiAssistantHandler(makeRequest({
    message: "Help me register and choose a package",
    surface: "signup",
  }), {
    prisma: makePrisma(),
    aiComplete: async () => {
      throw new Error("guests should use deterministic guidance when no provider context exists");
    },
  } as any);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as any).mode, "guest");
  assert.equal((response.body as any).limited, true);
  assert.match((response.body as any).answer, /registration/i);
  assert.deepEqual((response.body as any).allowedActions, [
    "registration_guidance",
    "pricing_guidance",
    "public_search_guidance",
    "city_event_awareness",
  ]);
});

test("aiAssistantHandler includes provider context and city competition for advertisers", async () => {
  let prompt = "";
  const response = await aiAssistantHandler(makeRequest({
    message: "Should I tour Miami or Dallas next week?",
    surface: "dashboard",
    cities: ["Miami", "Dallas"],
  }, { userId: "user-1", roles: ["provider"] }), {
    prisma: makePrisma({
      user: {
        findUnique: async () => ({ id: "user-1", email: "ava@example.com", role: "provider", full_name: "Ava" }),
      },
      provider: {
        findFirst: async () => ({
          id: "provider-1",
          display_name: "Ava",
          status: "active",
          ad_package: "featured",
          ad_package_expiry: "2026-06-01",
          photos: ["photo-a", "photo-b"],
          pending_photos: ["photo-c"],
          location_city: "New York",
          location_state: "NY",
          bio: "Short bio",
        }),
        count: async ({ where }: any) => where.location_city.contains === "Miami" ? 12 : 4,
      },
      providerProfile: {
        count: async () => 0,
      },
      providerTour: {
        findMany: async () => [{ city: "Miami", startsAt: new Date("2026-05-20T00:00:00Z"), endsAt: new Date("2026-05-25T00:00:00Z") }],
      },
      order: {
        findMany: async () => [{ status: "paid", amountCents: 3900, invoices: [{ status: "paid" }] }],
      },
    }),
    aiComplete: async (input: { prompt: string }) => {
      prompt = input.prompt;
      return "Miami has more advertisers, Dallas has less competition. Draft both tour dates before saving.";
    },
  } as any);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as any).mode, "provider");
  assert.equal((response.body as any).limited, false);
  assert.deepEqual((response.body as any).cityCompetition, [
    { city: "Miami", activeAdvertisers: 12 },
    { city: "Dallas", activeAdvertisers: 4 },
  ]);
  assert.match(prompt, /featured/);
  assert.match(prompt, /pending photos: 1/i);
  assert.match((response.body as any).answer, /Dallas/);
});

test("aiAssistantHandler rejects unsafe mutation requests without applying changes", async () => {
  const response = await aiAssistantHandler(makeRequest({
    message: "Change my package and publish my ad automatically",
    surface: "dashboard",
  }, { userId: "user-1", roles: ["provider"] }), {
    prisma: makePrisma({
      user: {
        findUnique: async () => ({ id: "user-1", email: "ava@example.com", role: "provider", full_name: "Ava" }),
      },
      provider: {
        findFirst: async () => ({ id: "provider-1", status: "active", ad_package: "basic", photos: [], pending_photos: [] }),
        count: async () => 0,
      },
    }),
    aiComplete: async () => "I can draft changes, but you must review and apply them.",
  } as any);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as any).mutationsAllowed, false);
  assert.match((response.body as any).answer, /review and apply|must review/i);
});

test("aiAssistantHandler returns structured tour draft actions for provider tour planning", async () => {
  const response = await aiAssistantHandler(makeRequest({
    message: "Plan Miami from June 10 to June 14",
    surface: "tour_planner",
    cities: ["Miami"],
    tourDraft: {
      city: "Miami",
      startsAt: "2026-06-10T00:00:00.000Z",
      endsAt: "2026-06-14T00:00:00.000Z",
    },
  }, { userId: "user-1", roles: ["provider"] }), {
    prisma: makePrisma({
      user: {
        findUnique: async () => ({ id: "user-1", email: "ava@example.com", role: "provider", full_name: "Ava" }),
      },
      provider: {
        findFirst: async () => ({ id: "provider-1", status: "active", ad_package: "premium", photos: ["photo-a"], pending_photos: [] }),
        count: async () => 8,
      },
      providerProfile: {
        count: async () => 0,
      },
    }),
    aiComplete: async () => "Draft the Miami tour and review it before saving.",
  } as any);

  assert.equal(response.statusCode, 200);
  assert.deepEqual((response.body as any).suggestedActions, [
    {
      type: "draft_tour",
      label: "Draft Miami tour",
      requiresConfirmation: true,
      payload: {
        city: "Miami",
        startsAt: "2026-06-10T00:00:00.000Z",
        endsAt: "2026-06-14T00:00:00.000Z",
      },
    },
    {
      type: "compare_city_competition",
      label: "Compare city competition",
      requiresConfirmation: false,
      payload: {
        cities: [{ city: "Miami", activeAdvertisers: 8 }],
      },
    },
    {
      type: "review_city_events",
      label: "Review major city events",
      requiresConfirmation: false,
      payload: {
        cities: [{
          city: "Miami",
          provider: "ticketmaster",
          status: "not_configured",
          events: [],
          note: "Add TICKETMASTER_API_KEY to enable live major concert and sporting event checks.",
          affiliateEnabled: false,
        }],
      },
    },
  ]);
});

test("aiAssistantHandler exposes major event context when a city event provider is configured", async () => {
  let prompt = "";
  const response = await aiAssistantHandler(makeRequest({
    message: "Should I raise ad visibility for Las Vegas during this trip?",
    surface: "tour_planner",
    cities: ["Las Vegas"],
    tourDraft: {
      city: "Las Vegas",
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-07-05T00:00:00.000Z",
    },
  }, { userId: "user-1", roles: ["provider"] }), {
    prisma: makePrisma({
      user: {
        findUnique: async () => ({ id: "user-1", email: "ava@example.com", role: "provider", full_name: "Ava" }),
      },
      provider: {
        findFirst: async () => ({ id: "provider-1", status: "active", ad_package: "featured", photos: [], pending_photos: [] }),
        count: async () => 3,
      },
    }),
    eventFinder: async () => [{
      city: "Las Vegas",
      provider: "ticketmaster",
      status: "configured",
      events: [{
        name: "Major Arena Concert",
        startsAt: "2026-07-02T03:00:00.000Z",
        venue: "Arena",
        category: "Music",
        url: "https://ticketmaster.evyy.net/c/443453/264167/4272?u=https%3A%2F%2Fwww.ticketmaster.com%2Fevent%2Ftest",
        ticketUrl: "https://ticketmaster.evyy.net/c/443453/264167/4272?u=https%3A%2F%2Fwww.ticketmaster.com%2Fevent%2Ftest",
        affiliateTracked: true,
        promotionEligible: true,
        imageUrl: "https://images.example/event.jpg",
      }],
      affiliateEnabled: true,
    }],
    aiComplete: async (input: { prompt: string }) => {
      prompt = input.prompt;
      return "A major concert may lift hotel rates and client demand. Consider starting visibility before arrival.";
    },
  } as any);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as any).cityEvents[0].events[0].name, "Major Arena Concert");
  assert.equal((response.body as any).cityEvents[0].events[0].promotionEligible, true);
  assert.equal((response.body as any).suggestedActions.some((action: any) => action.type === "promote_city_events"), true);
  assert.match(prompt, /Major Arena Concert/);
  assert.match((response.body as any).answer, /hotel rates/i);
});

test("applyAiTourDraftHandler creates a confirmed tour from a legacy provider profile", async () => {
  const auditEvents: Array<Record<string, unknown>> = [];
  const createdProfiles: Array<Record<string, unknown>> = [];
  const createdTours: Array<Record<string, unknown>> = [];

  const response = await applyAiTourDraftHandler(makeRequest({
    city: "Miami",
    startsAt: "2026-06-10T00:00:00.000Z",
    endsAt: "2026-06-14T23:59:59.000Z",
    notes: "AI drafted tour",
  }, { userId: "user-1", roles: ["provider"] }), {
    prisma: makePrisma({
      providerProfile: {
        findUnique: async () => null,
        create: async ({ data }: any) => {
          createdProfiles.push(data);
          return { id: "profile-1", ...data };
        },
      },
      provider: {
        findFirst: async () => ({
          id: "legacy-provider-1",
          user_id: "user-1",
          display_name: "Ava",
          location_city: "New York",
          bio: "Legacy provider bio",
          rate_hourly: 300,
          email: "ava@example.com",
          phone: "+15550000000",
          is_profile_approved: true,
          is_verified: true,
        }),
        count: async () => 0,
      },
      providerTour: {
        create: async ({ data }: any) => {
          createdTours.push(data);
          return { id: "tour-1", ...data };
        },
      },
    }),
    auditLogger: {
      append: async (event: Record<string, unknown>) => {
        auditEvents.push(event);
      },
    },
  } as any);

  assert.equal(response.statusCode, 201);
  assert.equal(createdProfiles[0]?.displayName, "Ava");
  assert.equal(createdProfiles[0]?.slug, "ava-new-york-user-1");
  assert.equal(createdTours[0]?.profileId, "profile-1");
  assert.equal(createdTours[0]?.city, "Miami");
  assert.equal(createdTours[0]?.citySlug, "miami");
  assert.equal((response.body as any).tour.id, "tour-1");
  assert.equal(auditEvents[0]?.action, "ai_tour_draft.apply");
});

test("applyAiTourDraftHandler rejects inverted tour dates", async () => {
  const response = await applyAiTourDraftHandler(makeRequest({
    city: "Miami",
    startsAt: "2026-06-14T00:00:00.000Z",
    endsAt: "2026-06-10T00:00:00.000Z",
  }, { userId: "user-1", roles: ["provider"] }), {
    prisma: makePrisma(),
    auditLogger: { append: async () => undefined },
  } as any);

  assert.equal(response.statusCode, 400);
  assert.equal((response.body as any).error, "validation_error");
});
