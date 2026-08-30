import { z } from "zod";
import type { ApiRequest, ApiResponse } from "../types.js";
import {
  canonicalizePublicCity,
  isValidUsStateAbbrev,
  resolveStateAbbrev,
  resolveStateFromCity,
} from "../lib/locationMatch.js";
import { IMPORTED_CATALOG_SYNC_SOURCES } from "../lib/catalogSyncPolicy.js";
import {
  readCatalogWorkerStatus,
  writeCatalogWorkerStatus,
} from "../lib/catalogWorkerStatus.js";

const MAX_BATCH = 100;
const MAX_PHOTOS = 32;

const sourceSchema = z.enum(IMPORTED_CATALOG_SYNC_SOURCES);

const providerItemSchema = z.object({
  display_name: z.string().trim().min(1).max(160),
  verification_url: z.string().trim().url().max(1000),
  location_city: z.string().trim().min(1).max(120).optional().nullable(),
  location_state: z.string().trim().min(1).max(80).optional().nullable(),
  location_country: z.string().trim().min(1).max(80).optional().nullable(),
  bio: z.string().trim().max(8000).optional().nullable(),
  tagline: z.string().trim().max(280).optional().nullable(),
  age: z.number().int().min(18).max(99).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable(),
  photos: z.array(z.string().trim().url().max(1000)).max(MAX_PHOTOS).optional().nullable(),
  services_offered: z.array(z.string().trim().min(1).max(80)).max(40).optional().nullable(),
  ad_headline: z.string().trim().max(200).optional().nullable(),
  ad_body: z.string().trim().max(8000).optional().nullable(),
  review_url: z.string().trim().url().max(1000).optional().nullable(),
  last_seen_at: z.string().datetime().optional().nullable(),
  is_verified: z.boolean().optional(),
  is_profile_approved: z.boolean().optional(),
  status: z.enum(["active", "inactive", "pending_verification"]).optional(),
});

const ingestBodySchema = z.object({
  source: sourceSchema,
  providers: z.array(providerItemSchema).min(1).max(MAX_BATCH),
  dry_run: z.boolean().optional(),
  reactivate: z.boolean().optional().default(true),
});

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

function requireServiceRole(request: ApiRequest): ApiResponse | null {
  if (!request.auth?.roles.includes("service") && !request.auth?.roles.includes("admin")) {
    return json(403, {
      error: "forbidden",
      message: "Service or admin role required for catalog ingest",
    });
  }
  return null;
}

function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const resolved = resolveStateAbbrev(raw) || String(raw).trim().toUpperCase();
  if (resolved.length === 2 && isValidUsStateAbbrev(resolved)) return resolved;
  return resolved.slice(0, 80) || null;
}

function normalizeCityState(item: z.infer<typeof providerItemSchema>): {
  location_city: string | null;
  location_state: string | null;
} {
  const stateHint = normalizeState(item.location_state);
  const cityRaw = item.location_city?.trim() || null;
  if (!cityRaw) {
    return { location_city: null, location_state: stateHint };
  }
  const canon = canonicalizePublicCity(cityRaw, stateHint);
  if (canon) {
    const resolvedState =
      stateHint ||
      resolveStateFromCity(canon.name) ||
      resolveStateFromCity(cityRaw) ||
      null;
    return {
      location_city: canon.name,
      location_state: resolvedState,
    };
  }
  return { location_city: cityRaw, location_state: stateHint };
}

function sanitizeText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let s = value;
  // Remove lone surrogates (unpaired high/low) that produce invalid JSON/Postgres e.g. truncated emoji \ud83d
  s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  // Strip control chars except \n \r \t
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Fix truncated hex escapes that cause Postgres "unexpected end of hex escape" via Prisma
  s = s.replace(/\\x(?![0-9A-Fa-f]{2})/g, "x");
  s = s.replace(/\\u(?![0-9A-Fa-f]{4})/g, "u");
  s = s.replace(/\\$/g, "");
  if (s.endsWith("\\")) s = s.slice(0, -1);
  return s;
}

function mergePhotos(existing: unknown, incoming: string[] | null | undefined): string[] | undefined {
  if (!incoming) return undefined;
  const prior = Array.isArray(existing)
    ? existing.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  return Array.from(new Set([...prior, ...incoming])).slice(0, MAX_PHOTOS);
}

export async function catalogIngestHandler(
  request: ApiRequest,
  context: { prisma?: any },
): Promise<ApiResponse> {
  const denied = requireServiceRole(request);
  if (denied) return denied;

  let body: z.infer<typeof ingestBodySchema>;
  try {
    body = ingestBodySchema.parse(request.body ?? {});
  } catch (err) {
    return json(400, {
      error: "invalid_body",
      message: err instanceof Error ? err.message : "Invalid catalog ingest body",
      allowed_sources: IMPORTED_CATALOG_SYNC_SOURCES,
      rejected_sources: ["ultragfe"],
    });
  }

  const prisma = context.prisma;
  if (!prisma?.provider) {
    return json(500, { error: "db_unavailable", message: "Prisma provider client missing" });
  }

  const dryRun = body.dry_run === true;
  const now = new Date();
  const results: Array<{
    verification_url: string;
    action: "created" | "updated" | "would_create" | "would_update" | "skipped";
    id?: string;
    reason?: string;
  }> = [];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of body.providers) {
    const { location_city: rawCity, location_state: rawState } = normalizeCityState(item);
    const location_city = sanitizeText(rawCity) as string | null;
    const location_state = sanitizeText(rawState) as string | null;
    const existing = await prisma.provider.findFirst({
      where: {
        verification_provider: body.source,
        verification_url: item.verification_url,
      },
    });

    const lastSeen = item.last_seen_at ? new Date(item.last_seen_at) : now;
    const photos = mergePhotos(existing?.photos, item.photos ?? null);

    const data: Record<string, unknown> = {
      display_name: String(sanitizeText(item.display_name) ?? item.display_name),
      verification_provider: body.source,
      verification_url: item.verification_url,
      location_city,
      location_state,
      location_country: item.location_country ?? existing?.location_country ?? "US",
      last_seen_at: lastSeen,
      review_provider: body.source,
    };

    if (item.bio !== undefined) data.bio = sanitizeText(item.bio);
    if (item.tagline !== undefined) data.tagline = sanitizeText(item.tagline);
    if (item.age !== undefined) data.age = item.age;
    if (item.phone !== undefined) data.phone = item.phone;
    if (item.email !== undefined) data.email = item.email;
    if (photos !== undefined) data.photos = photos;
    if (item.services_offered !== undefined) data.services_offered = item.services_offered;
    if (item.ad_headline !== undefined) data.ad_headline = sanitizeText(item.ad_headline);
    if (item.ad_body !== undefined) data.ad_body = sanitizeText(item.ad_body);
    if (item.review_url !== undefined) data.review_url = item.review_url;

    if (existing) {
      if (body.reactivate !== false) {
        data.status = item.status ?? "active";
        data.is_verified = item.is_verified ?? true;
        data.is_profile_approved = item.is_profile_approved ?? true;
      } else if (item.status) {
        data.status = item.status;
      }

      if (dryRun) {
        results.push({
          verification_url: item.verification_url,
          action: "would_update",
          id: existing.id,
        });
        updated += 1;
        continue;
      }

      try {
        const row = await prisma.provider.update({
          where: { id: existing.id },
          data,
        });
        results.push({
          verification_url: item.verification_url,
          action: "updated",
          id: row.id,
        });
        updated += 1;
        continue;
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        const isHexEscape = msg.includes("hex escape") || msg.includes("InvalidArg") || err?.code === "P2000" || msg.includes("unexpected");
        if (isHexEscape) {
          const fallbackData: Record<string, unknown> = { ...data };
          for (const k of ["display_name", "bio", "tagline", "ad_headline", "ad_body"]) {
            if (typeof fallbackData[k] === "string") {
              fallbackData[k] = String(fallbackData[k]).replace(/\\\\/g, "");
            }
          }
          try {
            const row2 = await prisma.provider.update({
              where: { id: existing.id },
              data: fallbackData,
            });
            results.push({
              verification_url: item.verification_url,
              action: "updated",
              id: row2.id,
            });
            updated += 1;
            continue;
          } catch (err2: any) {}
        }
        skipped += 1;
        results.push({
          verification_url: item.verification_url,
          action: "skipped",
          reason: msg.slice(0, 300),
        });
        continue;
      }
    }

    if (dryRun) {
      results.push({
        verification_url: item.verification_url,
        action: "would_create",
      });
      created += 1;
      continue;
    }

    try {
      const row = await prisma.provider.create({
        data: {
          ...data,
          status: item.status ?? "active",
          is_verified: item.is_verified ?? true,
          is_profile_approved: item.is_profile_approved ?? true,
          is_premium: false,
          photos: photos ?? item.photos ?? [],
          services_offered: item.services_offered ?? [],
        },
      });
      results.push({
        verification_url: item.verification_url,
        action: "created",
        id: row.id,
      });
      created += 1;
    } catch (err: any) {
      // Unique race: treat as update
      if (err?.code === "P2002") {
        const raced = await prisma.provider.findFirst({
          where: {
            verification_provider: body.source,
            verification_url: item.verification_url,
          },
        });
        if (raced) {
          const row = await prisma.provider.update({
            where: { id: raced.id },
            data,
          });
          results.push({
            verification_url: item.verification_url,
            action: "updated",
            id: row.id,
          });
          updated += 1;
          continue;
        }
      }
      skipped += 1;
      results.push({
        verification_url: item.verification_url,
        action: "skipped",
        reason: err instanceof Error ? err.message : "create_failed",
      });
    }
  }

  return json(dryRun ? 200 : 201, {
    ok: true,
    source: body.source,
    dry_run: dryRun,
    counts: { created, updated, skipped, total: body.providers.length },
    results,
  });
}

export async function catalogSourcesHandler(
  request: ApiRequest,
  _context: unknown,
): Promise<ApiResponse> {
  const denied = requireServiceRole(request);
  if (denied) return denied;

  return json(200, {
    ok: true,
    allowed_sources: IMPORTED_CATALOG_SYNC_SOURCES,
    rejected_sources: ["ultragfe"],
    ingest_path: "POST /api/v1/catalog/ingest",
    worker_status_path: "POST|GET /api/v1/catalog/worker-status",
    aura_evergreen_sync: "POST /api/v1/integrations/aura/evergreen-sync",
    aura_evergreen_status: "GET /api/v1/integrations/aura/evergreen-status",
    auth: "Bearer JWT with role=service (or admin)",
    max_batch: MAX_BATCH,
    note: "Eros/Tryst scrapers live outside LBV core (Aura / lbv-catalog-workers) and post through this API.",
  });
}

const workerStatusSchema = z.object({
  source: z.string().trim().min(1).max(40),
  state: z.string().trim().min(1).max(40),
  phase: z.string().trim().max(80).optional().nullable(),
  message: z.string().trim().max(500).optional().nullable(),
  counts: z.record(z.number()).optional().nullable(),
  startedAt: z.string().datetime().optional().nullable(),
  finishedAt: z.string().datetime().optional().nullable(),
  host: z.string().trim().max(120).optional().nullable(),
});

export async function catalogWorkerStatusGetHandler(
  request: ApiRequest,
  _context: unknown,
): Promise<ApiResponse> {
  const denied = requireServiceRole(request);
  if (denied) {
    // Dev dashboard uses admin/dev — allow those too
    const roles = request.auth?.roles ?? [];
    if (!roles.includes("admin") && !roles.includes("dev")) return denied;
  }
  const workers = await readCatalogWorkerStatus();
  return json(200, { ok: true, workers });
}

export async function catalogWorkerStatusPostHandler(
  request: ApiRequest,
  _context: unknown,
): Promise<ApiResponse> {
  const denied = requireServiceRole(request);
  if (denied) return denied;

  const parsed = workerStatusSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return json(400, { error: "validation_error", details: parsed.error.flatten() });
  }
  const saved = await writeCatalogWorkerStatus(parsed.data);
  return json(200, { ok: true, worker: saved });
}
