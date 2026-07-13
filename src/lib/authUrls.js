/**
 * Canonical auth URL helpers for Clerk path routing.
 * Keep login/register redirects consistent across Layout, RequireRole, and AuthContext.
 */

const AUTH_PATHS = new Set(["/login", "/register", "/auth/continue"]);

export function sanitizeNextUrl(rawNext, { fallback = "/" } = {}) {
  if (!rawNext || typeof rawNext !== "string") return fallback;
  const value = rawNext.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  // Prevent open redirects and auth loops
  const pathOnly = value.split("?")[0].split("#")[0];
  if (
    AUTH_PATHS.has(pathOnly) ||
    pathOnly.startsWith("/login/") ||
    pathOnly.startsWith("/register/") ||
    pathOnly.startsWith("/auth/")
  ) {
    return fallback;
  }
  return value;
}

export function currentAppPath() {
  if (typeof window === "undefined") return "/";
  return sanitizeNextUrl(`${window.location.pathname}${window.location.search || ""}`);
}

export function buildLoginUrl(next) {
  const safe = sanitizeNextUrl(next);
  if (!safe || safe === "/") return "/login";
  return `/login?next=${encodeURIComponent(safe)}`;
}

export function buildRegisterUrl(next) {
  const safe = sanitizeNextUrl(next);
  if (!safe || safe === "/") return "/register";
  return `/register?next=${encodeURIComponent(safe)}`;
}

export function buildAuthContinueUrl(next) {
  const safe = sanitizeNextUrl(next, { fallback: "/" });
  if (!safe || safe === "/") return "/auth/continue";
  return `/auth/continue?next=${encodeURIComponent(safe)}`;
}

/** Post-auth landing by DB role (Clerk = identity; Postgres role = authorization). */
export function defaultLandingForRole(role, next) {
  const safe = sanitizeNextUrl(next);
  if (safe && safe !== "/") return safe;
  switch (role) {
    case "admin":
      return "/admindashboard";
    case "dev":
      return "/devdashboard";
    case "provider":
    case "agency":
      return "/providerdashboard";
    default:
      return "/browse";
  }
}
