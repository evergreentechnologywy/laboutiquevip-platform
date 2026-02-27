import http from "node:http";
import { authFromHeaders } from "./auth.js";
import { getPrismaClient } from "./db/prisma.js";
import { enforceRbac } from "./middleware/rbac.js";
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
import { searchCitiesHandler, searchModelsHandler } from "./routes/search.js";
import type { ApiRequest, ApiResponse } from "./types.js";
import { ImmutableAuditLogger } from "./utils/auditLogger.js";

const PORT = Number(process.env.API_PORT ?? 8787);

function sendJson(res: http.ServerResponse, payload: ApiResponse): void {
  const statusCode = payload.statusCode;

  if (statusCode === 204) {
    res.writeHead(statusCode, payload.headers ?? {});
    res.end();
    return;
  }

  res.writeHead(statusCode, {
    "content-type": "application/json",
    ...(payload.headers ?? {}),
  });
  res.end(JSON.stringify(payload.body ?? {}));
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method ?? "")) {
    return undefined;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw);
}

function matchTourPath(pathname: string): string | null {
  const matched = pathname.match(/^\/api\/v1\/models\/me\/tours\/([^/]+)$/);
  return matched?.[1] ?? null;
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

  return {
    statusCode: 404,
    body: { error: "not_found" },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, {
      statusCode: 400,
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
    auth: authFromHeaders(req.headers),
    body,
  };

  let prisma: any;
  try {
    prisma = await getPrismaClient();
  } catch (error) {
    return sendJson(res, {
      statusCode: 500,
      body: {
        error: "prisma_unavailable",
        message: "Prisma client is not available",
      },
    });
  }

  const auditLogger = new ImmutableAuditLogger(prisma);
  const response = await routeRequest(request, { prisma, auditLogger });
  return sendJson(res, response);
});

export function startServer(): void {
  server.listen(PORT, () => {
    process.stdout.write(`Backend listening on :${PORT}\n`);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}
