import http from "node:http";
import { enforceRbac } from "./middleware/rbac.js";
import { healthHandler } from "./routes/health.js";
import type { ApiRequest, ApiResponse } from "./types.js";
import { ImmutableAuditLogger } from "./utils/auditLogger.js";

const PORT = Number(process.env.API_PORT ?? 8787);
const auditLogger = new ImmutableAuditLogger();

function sendJson(res: http.ServerResponse, payload: ApiResponse): void {
  res.writeHead(payload.statusCode, {
    "content-type": "application/json",
    ...(payload.headers ?? {}),
  });
  res.end(JSON.stringify(payload.body ?? {}));
}

const server = http.createServer(async (req, res) => {
  const request: ApiRequest = {
    method: req.method ?? "GET",
    path: req.url ?? "/",
    headers: req.headers,
    auth: {
      userId: null,
      roles: [],
    },
  };

  if (request.path === "/api/health" && request.method === "GET") {
    return sendJson(res, healthHandler());
  }

  if (request.path.startsWith("/api/admin")) {
    const denied = enforceRbac(request, {
      resource: "admin",
      action: request.method,
      allowedRoles: ["admin", "service"],
    });

    if (denied) {
      await auditLogger.append({
        actorId: request.auth?.userId ?? null,
        action: "rbac.denied",
        resourceType: "admin",
        resourceId: null,
        metadata: { path: request.path, method: request.method },
      });
      return sendJson(res, denied);
    }
  }

  return sendJson(res, {
    statusCode: 404,
    body: { error: "not_found" },
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
