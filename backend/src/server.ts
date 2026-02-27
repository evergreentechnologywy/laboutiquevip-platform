import http from "node:http";
import crypto from "node:crypto";
import { authFromHeaders } from "./auth.js";
import { getPrismaClient } from "./db/prisma.js";
import { enforceRbac } from "./middleware/rbac.js";
import { applyRateLimit } from "./middleware/rateLimit.js";
import { corsHeaders, securityHeaders } from "./middleware/security.js";
import {
  adminBillingReconciliationHandler,
  adminReportsQueueHandler,
  adminReviewVerificationHandler,
} from "./routes/admin.js";
import {
  createDiditSessionHandler,
  diditWebhookHandler,
} from "./routes/didit.js";
import { healthHandler } from "./routes/health.js";
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
import { sitemapHandler, seoCityHubsHandler, seoProfilesHandler } from "./routes/seo.js";
import { searchCitiesHandler, searchModelsHandler } from "./routes/search.js";
import { confirmoWebhookHandler } from "./routes/webhookConfirmo.js";
import type { ApiRequest, ApiResponse } from "./types.js";
import { ImmutableAuditLogger } from "./utils/auditLogger.js";

const PORT = Number(process.env.API_PORT ?? 8787);

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

async function readBody(req: http.IncomingMessage): Promise<{ rawBody: string | null; body: unknown }> {
  const method = req.method ?? "GET";
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { rawBody: null, body: undefined };
  }

  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return { rawBody: null, body: undefined };
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return { rawBody: null, body: undefined };
  }

  const contentType = req.headers["content-type"];
  const resolvedType = Array.isArray(contentType) ? contentType[0] : contentType;
  if (!resolvedType?.includes("application/json")) {
    return { rawBody: raw, body: undefined };
  }

  return { rawBody: raw, body: JSON.parse(raw) };
}

function matchTourPath(pathname: string): string | null {
  const matched = pathname.match(/^\/api\/v1\/models\/me\/tours\/([^/]+)$/);
  return matched?.[1] ?? null;
}

function matchAdminVerificationReviewPath(pathname: string): string | null {
  const matched = pathname.match(/^\/api\/admin\/verifications\/([^/]+)\/review$/);
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
  if (request.pathname === "/api/health" && request.method === "GET") {
    return healthHandler();
  }

  if (request.pathname.startsWith("/api/admin")) {
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

  if (request.pathname === "/api/v1/webhooks/confirmo" && request.method === "POST") {
    return confirmoWebhookHandler(request, context);
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

  return {
    statusCode: 404,
    body: { error: "not_found" },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
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

  let payload: { rawBody: string | null; body: unknown };
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

  const auditLogger = new ImmutableAuditLogger(prisma);
  const response = await routeRequest(request, { prisma, auditLogger });
  return sendResponse(res, {
    ...response,
    headers: {
      ...baseHeaders,
      ...(response.headers ?? {}),
    },
  });
});

export function startServer(): void {
  server.listen(PORT, () => {
    process.stdout.write(`Backend listening on :${PORT}\n`);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}
