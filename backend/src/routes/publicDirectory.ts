import type { ApiRequest, ApiResponse } from "../types.js";
import {
  findPublishedCity,
  findPublishedProfile,
  loadPublishedCatalog,
  profilesForCity,
  resolveLegacyCityListingRedirect,
} from "../lib/publishedCatalog.js";
import { renderCityPageHtml, renderProfilePageHtml } from "../services/publicHtml.js";
import { publicSearchCacheHeaders } from "./providerVisibility.js";

interface PublicDirectoryContext {
  prisma: any;
}

function html(statusCode: number, body: string, headers?: Record<string, string>): ApiResponse {
  return {
    statusCode,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...publicSearchCacheHeaders(),
      ...headers,
    },
    rawBody: body,
  };
}

function redirect(location: string, permanent = true): ApiResponse {
  return {
    statusCode: permanent ? 301 : 302,
    headers: {
      location,
      "cache-control": "public, max-age=3600",
    },
    body: null,
  };
}

/** GET /city/:slug — SSR city hub or redirect legacy listing slugs to /profile/:slug */
export async function publicCityPageHandler(
  request: ApiRequest,
  citySlug: string,
  context: PublicDirectoryContext,
): Promise<ApiResponse> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return { statusCode: 405, body: { error: "method_not_allowed" } };
  }

  const catalog = await loadPublishedCatalog(context.prisma);
  const redirectPath = resolveLegacyCityListingRedirect(citySlug, catalog);
  if (redirectPath) {
    return redirect(redirectPath, true);
  }

  const city = findPublishedCity(citySlug, catalog);
  if (!city) {
    return { statusCode: 404, body: { error: "not_found" } };
  }

  const profiles = profilesForCity(city.slug, catalog, 50);
  const page = renderCityPageHtml(city, profiles);

  if (request.method === "HEAD") {
    return html(200, "", { "content-type": "text/html; charset=utf-8" });
  }

  return html(200, page);
}

/** GET /profile/:slug — SSR profile page */
export async function publicProfilePageHandler(
  request: ApiRequest,
  profileSlug: string,
  context: PublicDirectoryContext,
): Promise<ApiResponse> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return { statusCode: 405, body: { error: "method_not_allowed" } };
  }

  const catalog = await loadPublishedCatalog(context.prisma);
  const profile = findPublishedProfile(profileSlug, catalog);
  if (!profile) {
    return { statusCode: 404, body: { error: "not_found" } };
  }

  const page = renderProfilePageHtml(profile);

  if (request.method === "HEAD") {
    return html(200, "", { "content-type": "text/html; charset=utf-8" });
  }

  return html(200, page);
}
