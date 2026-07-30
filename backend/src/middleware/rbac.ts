import type { ApiRequest, ApiResponse, Role } from "../types.js";

export interface RbacRule {
  resource: string;
  action: string;
  allowedRoles: Role[];
}

export function enforceRbac(
  request: ApiRequest,
  rule: RbacRule,
): ApiResponse | null {
  const roles = request.auth?.roles ?? [];
  const isAllowed = roles.some((role) => rule.allowedRoles.includes(role));

  if (isAllowed) {
    return null;
  }

  return {
    statusCode: 403,
    body: {
      error: "forbidden",
      message: `RBAC denied: ${rule.action} ${rule.resource}`,
    },
  };
}

/** Returns a preHandler-style guard: null if the request has any allowed role, else a 403 response. */
export function requireRole(
  ...allowedRoles: Role[]
): (request: ApiRequest) => ApiResponse | null {
  return (request: ApiRequest): ApiResponse | null => {
    const roles = request.auth?.roles ?? [];
    if (roles.some((role) => allowedRoles.includes(role))) {
      return null;
    }
    return {
      statusCode: 403,
      body: {
        error: "forbidden",
        message: `requires role: ${allowedRoles.join(" | ")}`,
      },
    };
  };
}
