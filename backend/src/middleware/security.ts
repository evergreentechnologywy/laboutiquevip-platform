import { corsAllowlist } from "../config/security.js";

const DEFAULT_SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "x-permitted-cross-domain-policies": "none",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
};

export function securityHeaders(): Record<string, string> {
  const csp = process.env.CONTENT_SECURITY_POLICY;
  if (csp?.trim()) {
    return {
      ...DEFAULT_SECURITY_HEADERS,
      "content-security-policy": csp.trim(),
    };
  }

  return DEFAULT_SECURITY_HEADERS;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowlist = corsAllowlist();
  if (!origin || allowlist.length === 0 || !allowlist.includes(origin)) {
    return {};
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-request-id,x-signature,x-nowpayments-sig,x-nowpayments-signature,x-didit-signature",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}
