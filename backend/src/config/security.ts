const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function envFlag(value: string | undefined, defaultValue = false): boolean {
  if (!value) {
    return defaultValue;
  }
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function allowHeaderAuthTrust(): boolean {
  if (isProduction()) {
    if (envFlag(process.env.ALLOW_HEADER_AUTH_TRUST, false)) {
      // eslint-disable-next-line no-console
      console.warn("[security] ALLOW_HEADER_AUTH_TRUST is set but IGNORED in production (header-auth bypass disabled).");
    }
    return false;
  }
  return envFlag(process.env.ALLOW_HEADER_AUTH_TRUST, false);
}

export function corsAllowlist(): string[] {
  const raw = process.env.CORS_ALLOWLIST;
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function webhookToleranceSeconds(): number {
  const raw = Number(process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS ?? 300);
  if (!Number.isFinite(raw) || raw < 30) {
    return 300;
  }
  return raw;
}

export function adminIpAllowlist(): string[] {
  const raw = process.env.ADMIN_IP_ALLOWLIST;
  if (!raw) {
    return [];
  }

  return raw.split(",").map((ip) => ip.trim()).filter(Boolean);
}

/** When false (default), X-Forwarded-For is ignored and socket IP is used for rate limits / anti-spam. */
export function trustProxyForwardedIp(): boolean {
  return envFlag(process.env.TRUST_PROXY_FORWARDED_IP, false);
}
