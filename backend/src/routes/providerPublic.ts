import type { ApiRequest, ApiResponse } from "../types.js";
import { sanitizeProviderContactForAudience } from "../lib/importedCatalog.js";
import { isUuid, legacyProviderSlug } from "../lib/providerSlug.js";
import {
  publicProviderProfileSelect,
  publicProviderVisibilityWhere,
  publicSearchCacheHeaders,
} from "./providerVisibility.js";
import { withPublicPhotos } from "../lib/publicPhotoUrls.js";

const publicProviderDetailSelect = {
  ...publicProviderProfileSelect,
  phone: true,
  email: true,
} as const;

interface ProviderPublicContext {
  prisma: any;
}

function json(statusCode: number, body: unknown, headers?: Record<string, string>): ApiResponse {
  return { statusCode, headers, body };
}

/** GET /api/v1/providers/by-slug/:slug — public profile lookup for SEO URLs. */
export async function getProviderBySlugHandler(
  request: ApiRequest,
  slug: string,
  context: ProviderPublicContext,
): Promise<ApiResponse> {
  let raw = String(slug || "").trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  const normalized = raw.toLowerCase();
  if (!normalized) {
    return json(400, { error: "validation_error", message: "slug required" });
  }

  const visibility = publicProviderVisibilityWhere();
  const select = publicProviderDetailSelect;
  const compact = normalized.replace(/[^a-z0-9]/g, "");

  let provider = null;

  if (isUuid(normalized)) {
    provider = await context.prisma.provider.findFirst({
      where: { ...visibility, id: normalized },
      select,
    });
  }

  if (!provider) {
    provider = await context.prisma.provider.findFirst({
      where: {
        ...visibility,
        verification_username: { equals: normalized, mode: "insensitive" },
      },
      select,
    });
  }

  if (!provider) {
    provider = await context.prisma.provider.findFirst({
      where: {
        ...visibility,
        display_name: { equals: normalized, mode: "insensitive" },
      },
      select,
    });
  }

  // Match frontend legacyProviderSlug: strip non-alnum from display_name
  // (e.g. "Jessica Jentry" -> "jessicajentry").
  if (!provider && compact.length >= 2 && typeof context.prisma.$queryRaw === "function") {
    try {
      const rows = (await context.prisma.$queryRaw`
        SELECT id
        FROM "Provider"
        WHERE status = 'active'
          AND lower(regexp_replace(coalesce(display_name, ''), '[^a-zA-Z0-9]+', '', 'g')) = ${compact}
        ORDER BY updated_date DESC NULLS LAST
        LIMIT 8
      `) as Array<{ id: string }>;
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const matched = await context.prisma.provider.findMany({
          where: { ...visibility, id: { in: ids } },
          select,
          take: 8,
        });
        provider =
          matched.find((row: { id: string; verification_url?: string | null; verification_username?: string | null; display_name?: string | null }) =>
            legacyProviderSlug(row) === compact || legacyProviderSlug(row) === normalized,
          ) ??
          matched[0] ??
          null;
      }
    } catch {
      /* fall through */
    }
  }

  if (!provider) {
    const candidates = await context.prisma.provider.findMany({
      where: {
        ...visibility,
        verification_url: { contains: `-${normalized}.html`, mode: "insensitive" },
      },
      select,
      take: 5,
    });
    provider =
      candidates.find((row: { id: string; verification_url?: string | null }) => legacyProviderSlug(row) === normalized || legacyProviderSlug(row) === compact) ??
      candidates[0] ??
      null;
  }

  if (!provider) {
    return json(404, { error: "not_found" });
  }

  return json(
    200,
    sanitizeProviderContactForAudience(
      {
        ...withPublicPhotos(provider),
        public_slug: legacyProviderSlug(provider),
      },
      { exposeImportedContact: true },
    ),
    publicSearchCacheHeaders(),
  );
}
