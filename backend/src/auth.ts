import jwt from "jsonwebtoken";
import type { ApiRequest, AuthContext, Role } from "./types.js";
import { allowHeaderAuthTrust } from "./config/security.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const ALLOWED_ROLES = new Set<Role>(["admin", "provider", "member", "service"]);

type TokenClaims = {
  sub?: string;
  role?: string;
  exp?: number;
  iat?: number;
};

function parseRoles(raw: string | undefined): Role[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter((role): role is Role => ALLOWED_ROLES.has(role as Role));
}

function getBearerToken(headers: ApiRequest["headers"]): string | null {
  const authorization = headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice(7);
}

function authFromBearerToken(headers: ApiRequest["headers"]): AuthContext | null {
  const token = getBearerToken(headers);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as TokenClaims;
    if (!decoded.sub || typeof decoded.sub !== "string") {
      return null;
    }

    const role = typeof decoded.role === "string" && ALLOWED_ROLES.has(decoded.role as Role)
      ? (decoded.role as Role)
      : null;

    return {
      userId: decoded.sub,
      roles: role ? [role] : [],
    };
  } catch {
    return null;
  }
}

function authFromTrustedHeaders(headers: ApiRequest["headers"]): AuthContext {
  if (!allowHeaderAuthTrust()) {
    return {
      userId: null,
      roles: [],
    };
  }

  const userIdHeader = headers["x-user-id"];
  const rolesHeader = headers["x-roles"];

  const userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
  const rolesRaw = Array.isArray(rolesHeader) ? rolesHeader[0] : rolesHeader;

  return {
    userId: userId ?? null,
    roles: parseRoles(rolesRaw),
  };
}

export function authFromHeaders(headers: ApiRequest["headers"]): AuthContext {
  const fromToken = authFromBearerToken(headers);
  if (fromToken) return fromToken;
  return authFromTrustedHeaders(headers);
}
