import type { ApiRequest, ApiResponse } from "../types.js";

interface Bucket {
  count: number;
  resetAt: number;
}

interface LimitRule {
  name: string;
  matcher: (request: ApiRequest) => boolean;
  windowMs: number;
  maxRequests: number;
}

const buckets = new Map<string, Bucket>();

const LIMIT_RULES: LimitRule[] = [
  {
    name: "auth",
    matcher: (request) => request.pathname.startsWith("/api/v1/auth") || request.pathname.startsWith("/api/auth"),
    windowMs: 60_000,
    maxRequests: 30,
  },
  {
    name: "contact",
    matcher: (request) => request.pathname.startsWith("/api/v1/contact"),
    windowMs: 60_000,
    maxRequests: 20,
  },
  {
    name: "ai",
    matcher: (request) => request.pathname.startsWith("/api/v1/ai"),
    windowMs: 60_000,
    maxRequests: 20,
  },
  {
    name: "webhooks",
    matcher: (request) => request.pathname.startsWith("/api/v1/webhooks"),
    windowMs: 60_000,
    maxRequests: 120,
  },
  {
    name: "admin",
    matcher: (request) => request.pathname.startsWith("/api/admin"),
    windowMs: 60_000,
    maxRequests: 30,
  },
  {
    name: "search",
    matcher: (request) => request.pathname.startsWith("/api/v1/search"),
    windowMs: 60_000,
    maxRequests: 60,
  },
  {
    name: "upload",
    matcher: (request) => request.pathname === "/api/upload",
    windowMs: 60_000,
    maxRequests: 20,
  },
];

function maybeCleanup(now: number): void {
  if (buckets.size < 5000) {
    return;
  }

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function applyRateLimit(request: ApiRequest): ApiResponse | null {
  const rule = LIMIT_RULES.find((item) => item.matcher(request));
  if (!rule) {
    return null;
  }

  const now = Date.now();
  maybeCleanup(now);

  const identity = request.ipAddress ?? "unknown";
  const bucketKey = `${rule.name}:${identity}`;
  const bucket = buckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: now + rule.windowMs,
    });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= rule.maxRequests) {
    return null;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return {
    statusCode: 429,
    headers: { "retry-after": String(retryAfterSeconds) },
    body: {
      error: "rate_limited",
      message: `Too many requests for ${rule.name}`,
    },
  };
}
