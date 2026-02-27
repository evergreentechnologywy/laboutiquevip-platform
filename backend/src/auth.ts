import type { ApiRequest, AuthContext, Role } from "./types.js";
import { allowHeaderAuthTrust } from "./config/security.js";

const ALLOWED_ROLES = new Set<Role>(["admin", "provider", "member", "service"]);

function parseRoles(raw: string | undefined): Role[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter((role): role is Role => ALLOWED_ROLES.has(role as Role));
}

export function authFromHeaders(headers: ApiRequest["headers"]): AuthContext {
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
