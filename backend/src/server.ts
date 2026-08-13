import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { authFromHeaders, authFromClerkJwt } from "./auth.js";
import { getPrismaClient } from "./db/prisma.js";
import { getLocalUploadPathFromRequestPath, shouldServeLocalUploads } from "./storage/uploads.js";
import path from "node:path";
import { validateStartupOrThrow } from "./config/startup.js";
import {
  captureBackendException,
  initBackendObservability,
} from "./observability.js";
import { adminIpAllowlist, trustProxyForwardedIp } from "./config/security.js";
import { enforceRbac, requireRole } from "./middleware/rbac.js";
import { applyRateLimit } from "./middleware/rateLimit.js";
import { corsHeaders, securityHeaders } from "./middleware/security.js";
import {
  createAgencyProfileHandler,
  deleteAgencyProfileHandler,
  getAgencyProfileHandler,
  listAgencyProfilesHandler,
  updateAgencyProfileHandler,
} from "./routes/agency.js";
import {
  auraEvergreenStatusHandler,
  auraEvergreenSyncHandler,
} from "./routes/auraIntegration.js";
import {
  adminBillingReconciliationHandler,
  adminReportsQueueHandler,
  adminReviewVerificationHandler,
} from "./routes/admin.js";
import { adminStatsHandler } from "./routes/adminStats.js";
import { adminPipelineRunsHandler, adminAuditEventsHandler } from "./routes/adminPipeline.js";
import { aiAssistantHandler, applyAiTourDraftHandler } from "./routes/aiAssistant.js";
import {
  devImportLogsHandler,
  devImportStatusHandler,
  devImportTriggerHandler,
  devMaintenanceHandler,
} from "./routes/dev.js";
import { systemStatusHandler } from "./routes/system.js";
import {
  createDiditSessionHandler,
  diditWebhookHandler,
} from "./routes/didit.js";
import { healthHandler } from "./routes/health.js";
import {
  createEntityHandler,
  listOrFilterEntityHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  registerHandler,
  updateProviderHandler,
  uploadHandler,
} from "./routes/base44Compat.js";
import {
  deleteTourHandler,
  getCalendarHandler,
  getModelMeHandler,
  getToursHandler,
  patchModelMeHandler,
  patchTourHandler,
  postToursHandler,
  putCalendarHandler,
  registerModelHandler,
} from "./routes/models.js";
import { sitemapHandler, seoCityHubsHandler, seoProfilesHandler, robotsHandler } from "./routes/seo.js";
import { publicCityPageHandler, publicProfilePageHandler } from "./routes/publicDirectory.js";
import { searchCitiesHandler, searchLocationsHandler, searchModelsHandler, searchProvidersHandler } from "./routes/search.js";
import { browseStateCitiesHandler, browseStatesHandler, statsHandler } from "./routes/browse.js";
import { getProviderBySlugHandler } from "./routes/providerPublic.js";
import { nowpaymentsWebhookHandler } from "./routes/webhookNowpayments.js";
import {
  createOrderHandler,
  getOrderHandler,
  listUserOrdersHandler,
} from "./routes/orders.js";
import type { ApiRequest, ApiResponse } from "./types.js";
import { ImmutableAuditLogger } from "./utils/auditLogger.js";
import { videoUploadHandler } from "./routes/base44Compat.js";
import { r2PhotoProxyHandler } from "./routes/r2-photo-proxy.js";
import { erosPhotoProxyHandler } from "./routes/eros-photo-proxy.js";
import { trystPhotoProxyHandler } from "./routes/tryst-photo-proxy.js";
import {
  guardPublicCatalogMaintenance,
  enrichPublicCatalogResponse,
} from "./lib/importMaintenance.js";
import {
  adminImportMaintenanceDeleteHandler,
  adminImportMaintenanceGetHandler,
  adminImportMaintenancePostHandler,
} from "./routes/adminImportMaintenance.js";
import { BodyTooLargeError, readBody } from "./http/readBody.js";


const PORT = Number(process.env.API_PORT ?? 8787);

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function getContentType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

initBackendObservability();

function sendResponse(res: http.ServerResponse, payload: ApiResponse): void {
  const statusCode = payload.statusCode;
  const headers = payload.headers ?? {};

  if (statusCode === 204) {
    res.writeHead(statusCode, headers);
    res.end();
    return;
  }

  if (payload.rawBuffer && Buffer.isBuffer(payload.rawBuffer)) {
    res.writeHead(statusCode, headers);
    res.end(payload.rawBuffer);
    return;
  }

  if (typeof payload.rawBody === "string") {
    res.writeHead(statusCode, headers);
    res.end(payload.rawBody);
    return;
  }

  if (typeof payload.body === "string") {
    res.writeHead(statusCode, {
      "content-type": headers["content-type"] ?? "text/plain; charset=utf-8",
      ...headers,
    });
    res.end(payload.body);
    return;
  }

  res.writeHead(statusCode, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(payload.body ?? {}));
}

function matchTourPath(pathname: string): string | null {
  const matched = pathname.match(/^\/api\/v1\/models\/me\/tours\/([^/]+)$/);
  return matched?.[1] ?? null;
}

function matchAdminVerificationReviewPath(pathname: string): string | null {
  const matched = pathname.match(/^\/api\/admin\/verifications\/([^/]+)\/review$/);
  return matched?.[1] ?? null;
}

function matchEntityIdPath(pathname: string): { entity: string; id: string } | null {
  const matched = pathname.match(/^\/api\/entities\/([^/]+)\/([^/]+)$/);
  if (!matched) return null;
  return { entity: matched[1] ?? "", id: matched[2] ?? "" };
}

function matchEntityPath(pathname: string): string | null {
  const matched = pathname.match(/^\/api\/entities\/([^/]+)$/);
  return matched?.[1] ?? null;
}

function matchOrderIdPath(pathname: string): string | null {
  const matched = pathname.match(/^\/api\/v1\/orders\/([^/]+)$/);
  return matched?.[1] ?? null;
}

function matchAgencyProfileIdPath(pathname: string): string | null {
  const matched = pathname.match(/^\/api\/v1\/agency\/profiles\/([^/]+)$/);
  return matched?.[1] ?? null;
}

function matchProviderSlugPath(pathname: string): string | null {
  const matched = pathname.match(/^\/api\/v1\/providers\/by-slug\/([^/]+)$/);
  return matched?.[1] ? decodeURIComponent(matched[1]) : null;
}

function resolveRequestIp(req: http.IncomingMessage): string | null {
  // Trust proxy headers (CF-Connecting-IP / X-Forwarded-For) only when the
  // deployment explicitly opts in via TRUST_PROXY_FORWARDED_IP — otherwise any
  // client can spoof them to bypass rate limits and the admin IP allowlist.
  if (trustProxyForwardedIp()) {
    const cfIp = req.headers["cf-connecting-ip"];
    const cfValue = Array.isArray(cfIp) ? cfIp[0] : cfIp;
    if (cfValue?.trim()) {
      return cfValue.trim();
    }

    const forwarded = req.headers["x-forwarded-for"];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (value?.trim()) {
      return value.split(",")[0]?.trim() ?? null;
    }
  }

  return req.socket.remoteAddress ?? null;
}

async function routeRequest(request: ApiRequest, context: { prisma: any; auditLogger: ImmutableAuditLogger }): Promise<ApiResponse> {
  const maintenanceBlock = guardPublicCatalogMaintenance(request);
  if (maintenanceBlock) {
    return maintenanceBlock;
  }

  if (request.pathname === "/api/health" && request.method === "GET") {
    return healthHandler();
  }

  if (request.pathname === "/api/auth/register" && request.method === "POST") return registerHandler(request, context);
  if (request.pathname === "/api/auth/login" && request.method === "POST") return loginHandler(request, context);
  if (request.pathname === "/api/auth/me" && request.method === "GET") return meHandler(request, context);
  if (request.pathname === "/api/auth/logout" && request.method === "POST") return logoutHandler();
  if (request.pathname === "/api/v1/ai/assistant" && request.method === "POST") return aiAssistantHandler(request, context);
  if (request.pathname === "/api/v1/ai/actions/tour-draft" && request.method === "POST") return applyAiTourDraftHandler(request, context);

  const entity = matchEntityPath(request.pathname);
  if (entity && request.method === "GET") return listOrFilterEntityHandler(request, entity, context);
  if (entity && request.method === "POST") return createEntityHandler(request, entity, context);

  const entityId = matchEntityIdPath(request.pathname);
  if (entityId && entityId.entity === "Provider" && request.method === "PATCH") {
    return updateProviderHandler(request, entityId.id, context);
  }

  if (request.pathname === "/api/upload" && request.method === "POST") return uploadHandler(request);

  if (request.pathname === "/api/video/upload" && request.method === "POST") return videoUploadHandler(request);

  if (request.pathname.startsWith("/api/r2-photo/") && (request.method === "GET" || request.method === "HEAD")) {
    return r2PhotoProxyHandler(request);
  }

  if (request.pathname === "/api/eros-photo" && (request.method === "GET" || request.method === "HEAD")) {
    return erosPhotoProxyHandler(request);
  }

  if (request.pathname === "/api/tryst-photo" && (request.method === "GET" || request.method === "HEAD")) {
    return trystPhotoProxyHandler(request);
  }

  if (request.pathname.startsWith("/api/admin")) {
    const allowlist = adminIpAllowlist();
    if (allowlist.length > 0) {
      const ip = request.ipAddress ?? "";
      if (!allowlist.includes(ip)) {
        await context.auditLogger.append({
          actorId: request.auth?.userId ?? null,
          action: "admin.ip_denied",
          resourceType: "admin",
          resourceId: null,
          metadata: { path: request.pathname, method: request.method, ipAddress: ip || null },
        });
        return { statusCode: 403, body: { error: "forbidden", message: "Admin access denied for IP" } };
      }
    }
    const denied = requireRole("admin", "service")(request);

    if (denied) {
      await context.auditLogger.append({
        actorId: request.auth?.userId ?? null,
        action: "rbac.denied",
        resourceType: "admin",
        resourceId: null,
        metadata: { path: request.pathname, method: request.method },
      });
      return denied;
    }
  }

  if (request.pathname === "/api/v1/models/register" && request.method === "POST") {
    return registerModelHandler(request, context);
  }

  if (request.pathname === "/api/v1/models/me" && request.method === "GET") {
    return getModelMeHandler(request, context);
  }

  if (request.pathname === "/api/v1/models/me" && request.method === "PATCH") {
    return patchModelMeHandler(request, context);
  }

  if (request.pathname === "/api/v1/models/me/calendar" && request.method === "GET") {
    return getCalendarHandler(request, context);
  }

  if (request.pathname === "/api/v1/models/me/calendar" && request.method === "PUT") {
    return putCalendarHandler(request, context);
  }

  if (request.pathname === "/api/v1/models/me/tours" && request.method === "GET") {
    return getToursHandler(request, context);
  }

  if (request.pathname === "/api/v1/models/me/tours" && request.method === "POST") {
    return postToursHandler(request, context);
  }

  const tourId = matchTourPath(request.pathname);
  if (tourId && request.method === "PATCH") {
    return patchTourHandler(request, tourId, context);
  }

  if (tourId && request.method === "DELETE") {
    return deleteTourHandler(request, tourId, context);
  }

  if (request.pathname === "/api/v1/search/locations" && request.method === "GET") {
    return searchLocationsHandler(request, context);
  }

  if (request.pathname === "/api/v1/search/cities" && request.method === "GET") {
    return searchCitiesHandler(request, context);
  }

  if (request.pathname === "/api/v1/search/models" && request.method === "GET") {
    return searchModelsHandler(request, context);
  }

  if (request.pathname === "/api/v1/search/providers" && request.method === "GET") {
    return searchProvidersHandler(request, context);
  }

  if (request.pathname === "/api/v1/browse/states" && request.method === "GET") {
    return browseStatesHandler(request, context);
  }

  const browseStateMatch = request.pathname.match(/^\/api\/v1\/browse\/states\/([a-zA-Z0-9-]+)$/);
  if (browseStateMatch && request.method === "GET") {
    return browseStateCitiesHandler(request, browseStateMatch[1], context);
  }

  if (request.pathname === "/api/v1/stats" && request.method === "GET") {
    return statsHandler(request, context);
  }

  if (request.pathname === "/api/v1/system/status" && request.method === "GET") {
    return systemStatusHandler(request, context);
  }

  if (request.pathname.startsWith("/api/v1/dev")) {
    const devDenied = requireRole("admin", "dev")(request);
    if (devDenied) return devDenied;
  }

  if (request.pathname === "/api/v1/dev/import/status" && request.method === "GET") {
    return devImportStatusHandler(request, context);
  }

  if (request.pathname === "/api/v1/dev/import/trigger" && request.method === "POST") {
    return devImportTriggerHandler(request, context);
  }

  if (request.pathname === "/api/v1/dev/maintenance" && request.method === "POST") {
    return devMaintenanceHandler(request, context);
  }

  if (request.pathname === "/api/v1/dev/import/logs" && request.method === "GET") {
    return devImportLogsHandler(request, context);
  }

  const providerSlug = matchProviderSlugPath(request.pathname);
  if (providerSlug && request.method === "GET") {
    return getProviderBySlugHandler(request, providerSlug, context);
  }

  if (request.pathname === "/api/v1/webhooks/nowpayments" && request.method === "POST") {
    return nowpaymentsWebhookHandler(request, context);
  }

  if (request.pathname === "/api/v1/orders" && request.method === "POST") {
    return createOrderHandler(request, context);
  }

  if (request.pathname === "/api/v1/orders" && request.method === "GET") {
    return listUserOrdersHandler(request, context);
  }

  if (request.pathname === "/api/v1/agency/profiles" && request.method === "GET") {
    return listAgencyProfilesHandler(request, context);
  }

  if (request.pathname === "/api/v1/agency/profiles" && request.method === "POST") {
    return createAgencyProfileHandler(request, context);
  }

  if (
    request.pathname === "/api/v1/integrations/aura/evergreen-sync" &&
    request.method === "POST"
  ) {
    return auraEvergreenSyncHandler(request, context);
  }
  if (
    request.pathname === "/api/v1/integrations/aura/evergreen-status" &&
    request.method === "GET"
  ) {
    return auraEvergreenStatusHandler(request, context);
  }

  const agencyProfileId = matchAgencyProfileIdPath(request.pathname);
  if (agencyProfileId && request.method === "GET") {
    return getAgencyProfileHandler(request, agencyProfileId, context);
  }

  if (agencyProfileId && request.method === "PATCH") {
    return updateAgencyProfileHandler(request, agencyProfileId, context);
  }

  if (agencyProfileId && request.method === "DELETE") {
    return deleteAgencyProfileHandler(request, agencyProfileId, context);
  }

  const orderId = matchOrderIdPath(request.pathname);
  if (orderId && request.method === "GET") {
    return getOrderHandler(request, context);
  }

  if (request.pathname === "/api/v1/verifications/didit/session" && request.method === "POST") {
    return createDiditSessionHandler(request, context);
  }

  if (request.pathname === "/api/v1/webhooks/didit" && request.method === "POST") {
    return diditWebhookHandler(request, context);
  }

  if (request.pathname === "/api/admin/reports" && request.method === "GET") {
    return adminReportsQueueHandler(request, context);
  }

  if (request.pathname === "/api/v1/admin/pipeline-runs" && request.method === "GET") {
    const denied = enforceRbac(request, { resource: "admin", action: "read", allowedRoles: ["admin", "service"] });
    if (denied) return denied;
    return adminPipelineRunsHandler(request, context);
  }

  if (request.pathname === "/api/admin/audit-events" && request.method === "GET") {
    const denied = enforceRbac(request, { resource: "admin", action: "read", allowedRoles: ["admin", "service"] });
    if (denied) return denied;
    return adminAuditEventsHandler(request, context);
  }

  if (request.pathname === "/api/admin/stats" && request.method === "GET") {
    return adminStatsHandler(request, context);
  }

  const verificationId = matchAdminVerificationReviewPath(request.pathname);
  if (verificationId && request.method === "POST") {
    return adminReviewVerificationHandler(request, verificationId, context);
  }

  if (request.pathname === "/api/admin/billing/reconciliation" && request.method === "GET") {
    return adminBillingReconciliationHandler(request, context);
  }

  if (request.pathname === "/api/admin/import/maintenance" && request.method === "GET") {
    return adminImportMaintenanceGetHandler(request);
  }

  if (request.pathname === "/api/admin/import/maintenance" && request.method === "POST") {
    return adminImportMaintenancePostHandler(request);
  }

  if (request.pathname === "/api/admin/import/maintenance" && request.method === "DELETE") {
    return adminImportMaintenanceDeleteHandler(request);
  }

  if (request.pathname === "/api/v1/seo/city-hubs" && request.method === "GET") {
    return seoCityHubsHandler(request, context);
  }

  if (request.pathname === "/api/v1/seo/profiles" && request.method === "GET") {
    return seoProfilesHandler(request, context);
  }

  if ((request.pathname === "/api/v1/seo/sitemap.xml" || request.pathname === "/sitemap.xml") && request.method === "GET") {
    return sitemapHandler(request, context);
  }

  if (request.pathname === "/robots.txt" && request.method === "GET") {
    return robotsHandler();
  }

  const publicCityMatch = request.pathname.match(/^\/city\/([^/]+)\/?$/);
  if (publicCityMatch && (request.method === "GET" || request.method === "HEAD")) {
    return publicCityPageHandler(request, publicCityMatch[1], context);
  }

  const publicProfileMatch = request.pathname.match(/^\/profile\/([^/]+)\/?$/);
  if (publicProfileMatch && (request.method === "GET" || request.method === "HEAD")) {
    return publicProfilePageHandler(request, publicProfileMatch[1], context);
  }

  return {
    statusCode: 404,
    body: { error: "not_found" },
  };
}

process.on("uncaughtException", (error) => {
  captureBackendException(error, { source: "uncaughtException" });
  console.error("Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  captureBackendException(reason, { source: "unhandledRejection" });
  console.error("Unhandled rejection", reason);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if ((req.method ?? "GET") === "GET" && shouldServeLocalUploads()) {
    const fullPath = getLocalUploadPathFromRequestPath(url.pathname);
    if (fullPath) {
      try {
        const data = await fs.readFile(fullPath);
        res.writeHead(200, { "content-type": getContentType(fullPath) });
        res.end(data);
      } catch {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
      }
      return;
    }
  }
  const requestId = crypto.randomUUID();
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  const baseHeaders = {
    ...securityHeaders(),
    ...corsHeaders(origin ?? null),
    "x-request-id": requestId,
  };

  if ((req.method ?? "GET") === "OPTIONS") {
    return sendResponse(res, { statusCode: 204, headers: baseHeaders });
  }

  let payload: { rawBody: string | null; rawBuffer: Buffer | null; body: unknown };
  try {
    payload = await readBody(req, url.pathname);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return sendResponse(res, {
        statusCode: 413,
        headers: baseHeaders,
        body: {
          error: "payload_too_large",
          maxBytes: error.maxBytes,
        },
      });
    }
    return sendResponse(res, {
      statusCode: 400,
      headers: baseHeaders,
      body: {
        error: "invalid_json",
        message: "Body must be valid JSON",
      },
    });
  }

  const request: ApiRequest = {
    method: req.method ?? "GET",
    path: req.url ?? "/",
    pathname: url.pathname,
    query: url.searchParams,
    headers: req.headers,
    ipAddress: resolveRequestIp(req),
    requestId,
    rawBody: payload.rawBody,
    rawBuffer: payload.rawBuffer ?? undefined,
    auth: authFromHeaders(req.headers),
    body: payload.body,
  };

  const rateLimited = applyRateLimit(request);
  if (rateLimited) {
    return sendResponse(res, {
      ...rateLimited,
      headers: {
        ...baseHeaders,
        ...(rateLimited.headers ?? {}),
      },
    });
  }

  let prisma: any;
  try {
    prisma = await getPrismaClient();
  } catch (error) {
    return sendResponse(res, {
      statusCode: 500,
      headers: baseHeaders,
      body: {
        error: "prisma_unavailable",
        message: "Prisma client is not available",
      },
    });
  }

  try {
    const auditLogger = new ImmutableAuditLogger(prisma);

    // Enrich auth with Clerk JWT if legacy auth returned no userId.
    // CRITICAL: handlers downstream expect `auth.userId` to be the internal
    // User.id UUID. Clerk's `sub` claim is the Clerk user id like
    // `user_xxx` which Prisma rejects when used in UUID columns.
    if (!request.auth?.userId) {
      const clerkAuth = await authFromClerkJwt(request.headers);
      if (clerkAuth) {
        try {
          const dbUser = await prisma.user.findFirst({ where: { clerk_id: clerkAuth.userId } });
          if (dbUser) {
            clerkAuth.clerkId = clerkAuth.userId;
            clerkAuth.userId = dbUser.id;
            if (clerkAuth.roles.length === 0 || clerkAuth.roles[0] === "member") {
              if (dbUser.role) clerkAuth.roles = [dbUser.role];
            }
          } else {
            // No internal user yet — keep Clerk id but flag for handlers
            // that need to auto-provision (meHandler does this on /api/auth/me).
            clerkAuth.clerkId = clerkAuth.userId;
            clerkAuth.userId = null;
          }
        } catch (e) {
          console.error("Failed to resolve clerk_id → internal user.id:", e);
        }
        request.auth = clerkAuth;
      }
    }

    const response = enrichPublicCatalogResponse(
      await routeRequest(request, { prisma, auditLogger }),
      request.pathname,
    );
    return sendResponse(res, {
      ...response,
      headers: {
        ...baseHeaders,
        ...(response.headers ?? {}),
      },
    });
  } catch (error) {
    console.error("Unhandled route error:", error);
    captureBackendException(error, {
      pathname: request.pathname,
      method: request.method,
      requestId,
    });

    return sendResponse(res, {
      statusCode: 500,
      headers: baseHeaders,
      body: {
        error: "internal_server_error",
        message: "Unexpected server error",
      },
    });
  }
});

export function startServer(): void {
  validateStartupOrThrow();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;
  server.maxRequestsPerSocket = 1000;
  server.listen(PORT, () => {
    process.stdout.write(`Backend listening on :${PORT}\n`);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}
