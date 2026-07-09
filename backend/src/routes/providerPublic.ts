import type { ApiRequest, ApiResponse } from "../types.js";
import { sanitizeProviderContactForAudience } from "../lib/importedCatalog.js";
import { isUuid, legacyProviderSlug } from "../lib/providerSlug.js";
import {
  publicProviderProfileSelect,
  publicProviderVisibilityWhere,
  publicSearchCacheHeaders,
} from "./providerVisibility.js";

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
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) {
    return json(400, { error: "validation_error", message: "slug required" });
  }

  const visibility = publicProviderVisibilityWhere();
  const select = publicProviderDetailSelect;

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
      candidates.find((row: { id: string; verification_url?: string | null }) => legacyProviderSlug(row) === normalized) ??
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
        ...provider,
        public_slug: legacyProviderSlug(provider),
      },
      { exposeImportedContact: true },
    ),
    publicSearchCacheHeaders(),
  );
}
