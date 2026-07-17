import { z } from "zod";
import type { ApiRequest, ApiResponse, Role } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import { slugify } from "../utils/slug.js";

interface AiAssistantContext {
  prisma: any;
  aiComplete?: (input: { prompt: string; mode: AssistantMode }) => Promise<string>;
  eventFinder?: (input: { cities: string[]; startsAt?: string; endsAt?: string }) => Promise<CityEventInsight[]>;
  auditLogger?: AuditLogger;
}

type AssistantMode = "guest" | "member" | "provider" | "admin";
type CityEventInsight = {
  city: string;
  provider: string;
  status: "configured" | "not_configured" | "unavailable";
  events: Array<{
    name: string;
    startsAt: string | null;
    venue?: string | null;
    category?: string | null;
    url?: string | null;
    ticketUrl?: string | null;
    affiliateTracked?: boolean;
    promotionEligible?: boolean;
    imageUrl?: string | null;
  }>;
  note?: string;
  affiliateEnabled?: boolean;
};

const aiAssistantSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  surface: z.enum(["guest", "signup", "dashboard", "tour_planner", "photo_advisor"]).optional().default("guest"),
  cities: z.array(z.string().trim().min(1).max(80)).max(8).optional().default([]),
  photoNotes: z.array(z.string().trim().max(500)).max(20).optional().default([]),
  tourDraft: z.object({
    city: z.string().trim().min(2).max(80),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  }).optional(),
});

const applyTourDraftSchema = z.object({
  city: z.string().trim().min(2).max(80),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().trim().max(1000).optional(),
}).refine((value) => new Date(value.startsAt).getTime() <= new Date(value.endsAt).getTime(), {
  path: ["startsAt"],
  message: "startsAt must be before or equal to endsAt",
});

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

function modeFromRoles(roles: Role[] = []): AssistantMode {
  if (roles.includes("admin") || roles.includes("service")) return "admin";
  if (roles.includes("provider")) return "provider";
  if (roles.includes("member")) return "member";
  return "guest";
}

function allowedActionsForMode(mode: AssistantMode): string[] {
  if (mode === "guest") {
    return ["registration_guidance", "pricing_guidance", "public_search_guidance", "city_event_awareness"];
  }

  if (mode === "member") {
    return ["registration_guidance", "pricing_guidance", "profile_setup_guidance", "public_search_guidance", "city_event_awareness"];
  }

  return [
    "registration_guidance",
    "pricing_guidance",
    "profile_setup_guidance",
    "ad_copy_draft",
    "photo_advice",
    "tour_planning",
    "city_competition",
    "city_event_awareness",
    "payment_status_explanation",
  ];
}

function fallbackAnswer(mode: AssistantMode, message: string, cityCompetition: Array<{ city: string; activeAdvertisers: number }>): string {
  if (mode === "guest") {
    return [
      "I can help with registration, pricing, package selection, and what to prepare before becoming an advertiser.",
      "Create an account first if you want profile-specific recommendations, photo guidance, tour planning, or payment status help.",
      `Your question: ${message}`,
    ].join("\n\n");
  }

  const cityLine = cityCompetition.length > 0
    ? `City competition: ${cityCompetition.map((item) => `${item.city}: ${item.activeAdvertisers} active advertiser${item.activeAdvertisers === 1 ? "" : "s"}`).join("; ")}.`
    : "Ask about a city or tour date and I can compare advertiser competition.";

  return [
    "I can help improve your ad, plan tours, compare cities, choose package timing, and prepare changes for you to approve.",
    cityLine,
    "I will draft recommendations only. I will not publish, change dates, change package, or modify photos without your confirmation.",
  ].join("\n\n");
}

async function defaultAiComplete(input: { prompt: string; mode: AssistantMode }): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const response = await fetch(process.env.DEEPSEEK_API_BASE_URL?.trim() || "https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
      temperature: 0.4,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: "You are La Boutique VIP's AI advertising copilot for advertisers, not a client booking assistant. The platform is an advertising directory. Help advertisers improve ad quality, plan touring cities/dates, compare advertiser competition, prepare photos, and understand visibility packages. Package tiers are Free Listing, Basic, Featured, and Premium. Do not invent booking subscriptions, client booking benefits, or VIP customer packages. Give practical, concise recommendations. Never claim you changed data, published listings, approved photos, processed payments, or bypassed moderation. For guests, help with directory discovery (city, verified/premium filters, rate bands, trust badges) and public advertiser registration/pricing/search guidance. Never invent private contact details or claim a booking was made. Prefer directing users to Browse with clear filter advice.",
        },
        { role: "user", content: input.prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek request failed: ${response.status} ${body}`.trim());
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

async function getUserContext(prisma: any, userId: string | null): Promise<any | null> {
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, full_name: true },
  });
}

async function getProviderContext(prisma: any, userId: string | null): Promise<any | null> {
  if (!userId) return null;
  return prisma.provider.findFirst({
    where: { user_id: userId },
    select: {
      id: true,
      display_name: true,
      status: true,
      ad_package: true,
      ad_package_expiry: true,
      ad_package_started_at: true,
      photos: true,
      pending_photos: true,
      location_city: true,
      location_state: true,
      bio: true,
      tagline: true,
      rate_hourly: true,
      is_verified: true,
      is_profile_approved: true,
    },
  });
}

async function getRecentOrders(prisma: any, userId: string | null): Promise<any[]> {
  if (!userId) return [];
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      status: true,
      amountCents: true,
      currency: true,
      createdAt: true,
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, paidAt: true },
      },
    },
  });
}

async function getProviderTours(prisma: any, userId: string | null): Promise<any[]> {
  if (!userId) return [];
  const profile = await prisma.providerProfile?.findUnique?.({
    where: { userId },
    select: { id: true },
  });
  if (!profile?.id) return [];

  return prisma.providerTour.findMany({
    where: { profileId: profile.id },
    orderBy: { startsAt: "asc" },
    take: 10,
    select: { city: true, startsAt: true, endsAt: true, notes: true },
  });
}

async function getCityCompetition(prisma: any, cities: string[]): Promise<Array<{ city: string; activeAdvertisers: number }>> {
  const uniqueCities = Array.from(new Set(cities.map((city) => city.trim()).filter(Boolean))).slice(0, 8);
  const out: Array<{ city: string; activeAdvertisers: number }> = [];

  for (const city of uniqueCities) {
    const [legacyCount, modelCount] = await Promise.all([
      prisma.provider.count({
        where: {
          status: "active",
          is_profile_approved: true,
          location_city: { contains: city, mode: "insensitive" },
        },
      }),
      prisma.providerProfile?.count
        ? prisma.providerProfile.count({
          where: {
            isPublished: true,
            city: { contains: city, mode: "insensitive" },
          },
        })
        : Promise.resolve(0),
    ]);
    out.push({ city, activeAdvertisers: legacyCount + modelCount });
  }

  return out;
}

function isAffiliateTrackedTicketmasterUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("ticketmaster.evyy.net")
      || parsed.hostname.includes("ticketmaster.pxf.io")
      || parsed.searchParams.has("utm_medium")
      || parsed.searchParams.has("irgwc");
  } catch {
    return false;
  }
}

function pickEventImage(event: any): string | null {
  const images = Array.isArray(event?.images) ? event.images : [];
  const image = images
    .filter((item: any) => typeof item?.url === "string")
    .sort((a: any, b: any) => Number(b?.width ?? 0) - Number(a?.width ?? 0))[0];
  return image?.url ?? null;
}

async function getMajorCityEvents(input: { cities: string[]; startsAt?: string; endsAt?: string }): Promise<CityEventInsight[]> {
  const uniqueCities = Array.from(new Set(input.cities.map((city) => city.trim()).filter(Boolean))).slice(0, 8);
  if (uniqueCities.length === 0) return [];

  const ticketmasterKey = process.env.TICKETMASTER_API_KEY?.trim();
  if (!ticketmasterKey) {
    return uniqueCities.map((city) => ({
      city,
      provider: "ticketmaster",
      status: "not_configured",
      events: [],
      note: "Add TICKETMASTER_API_KEY to enable live major concert and sporting event checks.",
      affiliateEnabled: false,
    }));
  }

  const affiliateConfigured = Boolean(process.env.TICKETMASTER_AFFILIATE_ID?.trim());
  const start = input.startsAt ? new Date(input.startsAt) : new Date();
  const end = input.endsAt ? new Date(input.endsAt) : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  const formatDate = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

  const insights: CityEventInsight[] = [];
  for (const city of uniqueCities) {
    try {
      const params = new URLSearchParams({
        apikey: ticketmasterKey,
        city,
        size: "8",
        sort: "date,asc",
        startDateTime: formatDate(start),
        endDateTime: formatDate(end),
        classificationName: "music,sports",
      });
      const response = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`);
      if (!response.ok) throw new Error(`ticketmaster_${response.status}`);
      const data = await response.json();
      const events = Array.isArray(data?._embedded?.events) ? data._embedded.events : [];
      const mappedEvents = events.map((event: any) => {
        const ticketUrl = event?.url ?? null;
        const affiliateTracked = isAffiliateTrackedTicketmasterUrl(ticketUrl);
        return {
          name: String(event?.name ?? "Untitled event"),
          startsAt: event?.dates?.start?.dateTime ?? event?.dates?.start?.localDate ?? null,
          venue: event?._embedded?.venues?.[0]?.name ?? null,
          category: event?.classifications?.[0]?.segment?.name ?? null,
          url: ticketUrl,
          ticketUrl,
          affiliateTracked,
          promotionEligible: Boolean(ticketUrl) && (affiliateTracked || affiliateConfigured),
          imageUrl: pickEventImage(event),
        };
      });

      insights.push({
        city,
        provider: "ticketmaster",
        status: "configured",
        affiliateEnabled: affiliateConfigured || mappedEvents.some((event: any) => event.affiliateTracked),
        events: mappedEvents,
      });
    } catch {
      insights.push({
        city,
        provider: "ticketmaster",
        status: "unavailable",
        events: [],
        note: "The live event provider did not return data for this request.",
        affiliateEnabled: false,
      });
    }
  }

  return insights;
}

function buildPrompt(input: {
  message: string;
  surface: string;
  mode: AssistantMode;
  user: any | null;
  provider: any | null;
  orders: any[];
  tours: any[];
  cityCompetition: Array<{ city: string; activeAdvertisers: number }>;
  cityEvents: CityEventInsight[];
  photoNotes: string[];
}): string {
  const provider = input.provider;
  const photos = Array.isArray(provider?.photos) ? provider.photos.length : 0;
  const pendingPhotos = Array.isArray(provider?.pending_photos) ? provider.pending_photos.length : 0;

  return [
    `Surface: ${input.surface}`,
    `Mode: ${input.mode}`,
    `User: ${input.user ? `${input.user.full_name ?? "registered user"} (${input.user.role})` : "guest"}`,
    provider
      ? [
        "Provider profile:",
        `name: ${provider.display_name ?? "unknown"}`,
        `status: ${provider.status}`,
        `package: ${provider.ad_package ?? "none"}`,
        `package expiry: ${provider.ad_package_expiry ?? "none"}`,
        `city: ${provider.location_city ?? "unset"}, ${provider.location_state ?? ""}`,
        `verified: ${Boolean(provider.is_verified)}`,
        `approved: ${Boolean(provider.is_profile_approved)}`,
        `photos: ${photos}`,
        `pending photos: ${pendingPhotos}`,
        `rate hourly: ${provider.rate_hourly ?? "unset"}`,
        `bio: ${provider.bio ?? ""}`,
      ].join("\n")
      : "Provider profile: none",
    `Recent orders: ${JSON.stringify(input.orders.map((order) => ({ status: order.status, amountCents: order.amountCents, invoiceStatus: order.invoices?.[0]?.status ?? null })))}`,
    `Existing tours: ${JSON.stringify(input.tours)}`,
    `City competition: ${JSON.stringify(input.cityCompetition)}`,
    `Major city events: ${JSON.stringify(input.cityEvents)}`,
    `Photo notes: ${JSON.stringify(input.photoNotes)}`,
    "Known package tiers: Free Listing ($0), Basic ($19/week or $59/month), Featured ($39/week or $119/month), Premium ($69/week or $199/month). These are advertiser visibility packages, not client booking subscriptions.",
    "Rules: recommend and draft only unless the user explicitly confirms a suggested action in the UI. Do not say that any profile, photo, tour, package, or payment was changed. Keep guest answers limited to public registration/pricing/search guidance. When major city event data is configured, explain how concerts or sporting events may affect hotel rates, demand, and timing. If affiliate-tracked event links are present, mention that the platform can promote relevant concerts or sports events while also warning advertisers about demand spikes. If the live event feed is not configured, say so plainly.",
    `Question: ${input.message}`,
  ].join("\n\n");
}

function buildSuggestedActions(input: {
  mode: AssistantMode;
  tourDraft?: { city: string; startsAt: string; endsAt: string };
  cityCompetition: Array<{ city: string; activeAdvertisers: number }>;
  cityEvents: CityEventInsight[];
}): Array<Record<string, unknown>> {
  const actions: Array<Record<string, unknown>> = [];
  if (input.mode !== "guest" && input.tourDraft) {
    actions.push({
      type: "draft_tour",
      label: `Draft ${input.tourDraft.city} tour`,
      requiresConfirmation: true,
      payload: input.tourDraft,
    });
  }

  if (input.cityCompetition.length > 0) {
    actions.push({
      type: "compare_city_competition",
      label: "Compare city competition",
      requiresConfirmation: false,
      payload: { cities: input.cityCompetition },
    });
  }

  if (input.cityEvents.length > 0) {
    actions.push({
      type: "review_city_events",
      label: "Review major city events",
      requiresConfirmation: false,
      payload: { cities: input.cityEvents },
    });
  }

  const promotableEvents = input.cityEvents
    .flatMap((item) => item.events.map((event) => ({ ...event, city: item.city })))
    .filter((event) => event.promotionEligible && event.ticketUrl)
    .slice(0, 6);
  if (promotableEvents.length > 0) {
    actions.push({
      type: "promote_city_events",
      label: "Promote relevant concerts and games",
      requiresConfirmation: false,
      payload: { events: promotableEvents },
    });
  }

  return actions;
}

async function ensureProviderProfileForAiTour(prisma: any, userId: string): Promise<any | null> {
  const existing = await prisma.providerProfile?.findUnique?.({ where: { userId } });
  if (existing?.id) return existing;

  const legacy = await prisma.provider.findFirst({ where: { user_id: userId } });
  if (!legacy) return null;

  const displayName = legacy.display_name || "Advertiser";
  const city = legacy.location_city || "Online";
  const citySlug = slugify(city) || "online";
  const displaySlug = slugify(displayName) || "advertiser";
  const userSuffix = String(userId).slice(0, 8);

  return prisma.providerProfile.create({
    data: {
      userId,
      slug: `${displaySlug}-${citySlug}-${userSuffix}`,
      displayName,
      city,
      citySlug,
      bio: legacy.bio || null,
      services: [],
      rates: {
        currency: "USD",
        ...(legacy.rate_hourly ? { hourly: legacy.rate_hourly } : {}),
      },
      contactPreferences: {
        ...(legacy.email ? { email: legacy.email } : {}),
        ...(legacy.phone ? { phone: legacy.phone } : {}),
      },
      isPublished: false,
      isVerified: Boolean(legacy.is_verified),
    },
  });
}

export async function aiAssistantHandler(request: ApiRequest, context: AiAssistantContext): Promise<ApiResponse> {
  const parsed = aiAssistantSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return json(400, {
      error: "validation_error",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const userId = request.auth?.userId ?? null;
  const mode = modeFromRoles(request.auth?.roles ?? []);
  const eventCities = parsed.data.tourDraft?.city
    ? [...parsed.data.cities, parsed.data.tourDraft.city]
    : parsed.data.cities;
  const [user, provider, orders, tours, cityCompetition, cityEvents] = await Promise.all([
    getUserContext(context.prisma, userId),
    mode === "guest" ? Promise.resolve(null) : getProviderContext(context.prisma, userId),
    mode === "guest" ? Promise.resolve([]) : getRecentOrders(context.prisma, userId),
    mode === "guest" ? Promise.resolve([]) : getProviderTours(context.prisma, userId),
    getCityCompetition(context.prisma, parsed.data.cities),
    (context.eventFinder ?? getMajorCityEvents)({
      cities: eventCities,
      startsAt: parsed.data.tourDraft?.startsAt,
      endsAt: parsed.data.tourDraft?.endsAt,
    }),
  ]);

  const prompt = buildPrompt({
    message: parsed.data.message,
    surface: parsed.data.surface,
    mode,
    user,
    provider,
    orders,
    tours,
    cityCompetition,
    cityEvents,
    photoNotes: parsed.data.photoNotes,
  });

  let answer: string | null = null;
  try {
    const complete = context.aiComplete ?? defaultAiComplete;
    answer = await complete({ prompt, mode });
  } catch {
    answer = null;
  }

  return json(200, {
    mode,
    limited: mode === "guest",
    mutationsAllowed: false,
    allowedActions: allowedActionsForMode(mode),
    cityCompetition,
    cityEvents,
    suggestedActions: buildSuggestedActions({
      mode,
      tourDraft: parsed.data.tourDraft,
      cityCompetition,
      cityEvents,
    }),
    answer: answer || fallbackAnswer(mode, parsed.data.message, cityCompetition),
  });
}

export async function applyAiTourDraftHandler(request: ApiRequest, context: AiAssistantContext): Promise<ApiResponse> {
  const roles = request.auth?.roles ?? [];
  const userId = request.auth?.userId ?? null;
  if (!userId || (!roles.includes("provider") && !roles.includes("admin"))) {
    return json(403, { error: "forbidden", message: "Only advertisers can apply AI tour drafts." });
  }

  const parsed = applyTourDraftSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return json(400, {
      error: "validation_error",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const profile = await ensureProviderProfileForAiTour(context.prisma, userId);
  if (!profile?.id) {
    return json(404, { error: "provider_profile_not_found", message: "Create an advertiser profile before applying a tour draft." });
  }

  const citySlug = slugify(parsed.data.city) || "tour";
  const tour = await context.prisma.providerTour.create({
    data: {
      profileId: profile.id,
      city: parsed.data.city,
      citySlug,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
      notes: parsed.data.notes || "Created from the AI advertising copilot after advertiser confirmation.",
    },
  });

  await context.auditLogger?.append({
    actorId: userId,
    action: "ai_tour_draft.apply",
    resourceType: "provider_tour",
    resourceId: tour.id,
    metadata: {
      profileId: profile.id,
      city: parsed.data.city,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      requestId: request.requestId,
    },
  });

  return json(201, { tour });
}
