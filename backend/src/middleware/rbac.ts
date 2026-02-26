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
