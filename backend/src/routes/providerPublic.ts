import type { ApiRequest, ApiResponse } from "../types.js";
import { isUuid, legacyProviderSlug } from "../lib/providerSlug.js";
import { publicProviderVisibilityWhere, publicSearchCacheHeaders } from "./providerVisibility.js";

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

  let provider = null;

  if (isUuid(normalized)) {
    provider = await context.prisma.provider.findFirst({
      where: { ...visibility, id: normalized },
    });
  }

  if (!provider) {
    provider = await context.prisma.provider.findFirst({
      where: {
        ...visibility,
        verification_username: { equals: normalized, mode: "insensitive" },
      },
    });
  }

  if (!provider) {
    const candidates = await context.prisma.provider.findMany({
      where: {
        ...visibility,
        verification_url: { contains: `-${normalized}.html`, mode: "insensitive" },
      },
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
    {
      ...provider,
      public_slug: legacyProviderSlug(provider),
    },
    publicSearchCacheHeaders(),
  );
}
