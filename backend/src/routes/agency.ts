import type { ApiRequest, ApiResponse } from "../types.js";
import type { AuditLogger } from "../utils/auditLogger.js";
import { deriveProviderState } from "../lib/deriveProviderState.js";
import { providerCreateSchema, providerUpdateSchema } from "../validation/base44Compat.js";

interface AgencyContext {
  prisma: any;
  auditLogger: AuditLogger;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

function hasRole(request: ApiRequest, role: "agency" | "admin" | "service"): boolean {
  return request.auth?.roles.includes(role) ?? false;
}

function unauthorized(): ApiResponse {
  return json(401, { error: "unauthorized", message: "Authentication required" });
}

function forbidden(message: string): ApiResponse {
  return json(403, { error: "forbidden", message });
}

async function ensureAgencyAccount(
  request: ApiRequest,
  context: AgencyContext,
): Promise<{ userId?: string; isPrivileged?: boolean; error?: ApiResponse }> {
  const userId = request.auth?.userId;
  if (!userId) {
    return { error: unauthorized() };
  }

  const isPrivileged = hasRole(request, "admin") || hasRole(request, "service");
  if (isPrivileged) {
    return { userId, isPrivileged };
  }

  if (!hasRole(request, "agency")) {
    return { error: forbidden("Agency role required") };
  }

  const user = await context.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });

  if (!user || user.role !== "agency") {
    return { error: forbidden("Agency role required") };
  }

  if (String(user.status ?? "").toLowerCase() !== "active") {
    return {
      error: forbidden("Agency account must be approved (active) before using agency profile API"),
    };
  }

  return { userId, isPrivileged: false };
}

function parseLimit(value: string | null, fallback = 100): number {
  const numeric = Number(value ?? "");
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(500, Math.floor(numeric));
}

export async function listAgencyProfilesHandler(
  request: ApiRequest,
  context: AgencyContext,
): Promise<ApiResponse> {
  const auth = await ensureAgencyAccount(request, context);
  if (auth.error) return auth.error;

  const where = auth.isPrivileged
    ? (() => {
        const owner = request.query.get("owner_user_id");
        return owner ? { user_id: owner } : {};
      })()
    : { user_id: auth.userId };

  const limit = parseLimit(request.query.get("limit"), 100);
  const rows = await context.prisma.provider.findMany({
    where,
    orderBy: { created_date: "desc" },
    take: limit,
  });

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "agency.profiles.list",
    resourceType: "provider",
    resourceId: null,
    metadata: { count: rows.length, limit },
  });

  return json(200, { items: rows, count: rows.length });
}

export async function createAgencyProfileHandler(
  request: ApiRequest,
  context: AgencyContext,
): Promise<ApiResponse> {
  const auth = await ensureAgencyAccount(request, context);
  if (auth.error) return auth.error;

  const targetOwner = auth.isPrivileged ? request.query.get("owner_user_id") || auth.userId : auth.userId;
  const parsed = providerCreateSchema.safeParse({
    ...((request.body ?? {}) as Record<string, unknown>),
    user_id: targetOwner,
  });
  if (!parsed.success) {
    return json(400, {
      error: "validation_error",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const data = deriveProviderState(parsed.data, null, { isAdmin: auth.isPrivileged ?? false });
  const created = await context.prisma.provider.create({
    data,
  });

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "agency.profiles.create",
    resourceType: "provider",
    resourceId: created.id,
    metadata: { ownerUserId: created.user_id },
  });

  return json(201, created);
}

async function getOwnedProfile(
  request: ApiRequest,
  profileId: string,
  context: AgencyContext,
): Promise<{ profile?: any; error?: ApiResponse }> {
  const auth = await ensureAgencyAccount(request, context);
  if (auth.error) return { error: auth.error };

  const where = auth.isPrivileged
    ? { id: profileId }
    : { id: profileId, user_id: auth.userId };

  const profile = await context.prisma.provider.findFirst({ where });
  if (!profile) {
    return { error: json(404, { error: "not_found", message: "Profile not found" }) };
  }
  return { profile };
}

export async function getAgencyProfileHandler(
  request: ApiRequest,
  profileId: string,
  context: AgencyContext,
): Promise<ApiResponse> {
  const resolved = await getOwnedProfile(request, profileId, context);
  if (resolved.error) return resolved.error;
  return json(200, resolved.profile);
}

export async function updateAgencyProfileHandler(
  request: ApiRequest,
  profileId: string,
  context: AgencyContext,
): Promise<ApiResponse> {
  const resolved = await getOwnedProfile(request, profileId, context);
  if (resolved.error) return resolved.error;

  const parsed = providerUpdateSchema.safeParse((request.body ?? {}) as Record<string, unknown>);
  if (!parsed.success) {
    return json(400, {
      error: "validation_error",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const data = deriveProviderState(parsed.data, resolved.profile, { isAdmin: hasRole(request, "admin") || hasRole(request, "service") });
  const updated = await context.prisma.provider.update({
    where: { id: profileId },
    data,
  });

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "agency.profiles.update",
    resourceType: "provider",
    resourceId: profileId,
    metadata: { ownerUserId: updated.user_id },
  });

  return json(200, updated);
}

export async function deleteAgencyProfileHandler(
  request: ApiRequest,
  profileId: string,
  context: AgencyContext,
): Promise<ApiResponse> {
  const resolved = await getOwnedProfile(request, profileId, context);
  if (resolved.error) return resolved.error;

  await context.prisma.provider.delete({
    where: { id: profileId },
  });

  await context.auditLogger.append({
    actorId: request.auth?.userId ?? null,
    action: "agency.profiles.delete",
    resourceType: "provider",
    resourceId: profileId,
    metadata: { ownerUserId: resolved.profile.user_id },
  });

  return { statusCode: 204, body: null };
}
