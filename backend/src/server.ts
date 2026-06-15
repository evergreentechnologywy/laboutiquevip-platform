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
import { adminIpAllowlist } from "./config/security.js";
import { enforceRbac } from "./middleware/rbac.js";
import { applyRateLimit } from "./middleware/rateLimit.js";
import { corsHeaders, securityHeaders } from "./middleware/security.js";
import {
  adminBillingReconciliationHandler,
  adminReportsQueueHandler,
  adminReviewVerificationHandler,
} from "./routes/admin.js";
import { aiAssistantHandler, applyAiTourDraftHandler } from "./routes/aiAssistant.js";
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
import { searchCitiesHandler, searchModelsHandler, searchProvidersHandler } from "./routes/search.js";
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

async function readBody(req: http.IncomingMessage): Promise<{ rawBody: string | null; rawBuffer: Buffer | null; body: unknown }> {
  const method = req.method ?? "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { rawBody: null, rawBuffer: null, body: undefined };
  }

  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return { rawBody: null, rawBuffer: null, body: undefined };
  }

  const rawBuffer = Buffer.concat(chunks);
  const raw = rawBuffer.toString("utf8").trim();
  if (!raw) {
    return { rawBody: null, rawBuffer: null, body: undefined };
  }

  const contentType = req.headers["content-type"];
  const resolvedType = Array.isArray(contentType) ? contentType[0] : contentType;

  // For multipart, keep the raw Buffer
  if (resolvedType?.includes("multipart/form-data")) {
    return { rawBody: null, rawBuffer, body: undefined };
  }

  if (!resolvedType?.includes("application/json")) {
    return { rawBody: raw, rawBuffer: null, body: undefined };
  }

  return { rawBody: raw, rawBuffer: null, body: JSON.parse(raw) };
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

function resolveRequestIp(req: http.IncomingMessage): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (value?.trim()) {
    return value.split(",")[0]?.trim() ?? null;
  }

  return req.socket.remoteAddress ?? null;
}

async function routeRequest(request: ApiRequest, context: { prisma: any; auditLogger: ImmutableAuditLogger }): Promise<ApiResponse> {
  console.log("routeRequest PATH:", request.pathname, "METHOD:", request.method);
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

  if (request.pathname.startsWith("/api/r2-photo/") && request.method === "GET") {
    return r2PhotoProxyHandler(request);
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
    const denied = enforceRbac(request, {
      resource: "admin",
      action: request.method,
      allowedRoles: ["admin", "service"],
    });

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

  if (request.pathname === "/api/v1/search/cities" && request.method === "GET") {
    return searchCitiesHandler(request, context);
  }

  if (request.pathname === "/api/v1/search/models" && request.method === "GET") {
    return searchModelsHandler(request, context);
  }

  if (request.pathname === "/api/v1/search/providers" && request.method === "GET") {
    return searchProvidersHandler(request, context);
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

  const verificationId = matchAdminVerificationReviewPath(request.pathname);
  if (verificationId && request.method === "POST") {
    return adminReviewVerificationHandler(request, verificationId, context);
  }

  if (request.pathname === "/api/admin/billing/reconciliation" && request.method === "GET") {
    return adminBillingReconciliationHandler(request, context);
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
    payload = await readBody(req);
  } catch {
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

    // Enrich auth with Clerk JWT if legacy auth returned no userId
    if (!request.auth?.userId) {
      const clerkAuth = await authFromClerkJwt(request.headers);
      if (clerkAuth) {
        request.auth = clerkAuth;
      }
    }

    const response = await routeRequest(request, { prisma, auditLogger });
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
