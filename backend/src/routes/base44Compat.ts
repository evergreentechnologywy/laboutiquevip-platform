import crypto, { timingSafeEqual } from "node:crypto";
import { verifyToken } from "@clerk/backend";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { ApiRequest, ApiResponse, Role } from "../types.js";
import {
  bookingCreateSchema,
  loginSchema,
  messageCreateSchema,
  providerCreateSchema,
  providerUpdateSchema,
  providerAdminUpdateSchema,
  registerSchema,
  reviewCreateSchema,
  uploadSchema,
  verificationCreateSchema,
} from "../validation/base44Compat.js";
import { storeUpload } from "../storage/uploads.js";
import { storeVideo, isAllowedVideoType, MAX_VIDEO_BYTES } from "../storage/video.js";
import {
  sanitizeProviderContactForAudience,
} from "../lib/importedCatalog.js";
import { publicProviderProfileSelect, publicProviderVisibilityWhere } from "./providerVisibility.js";
import { sanitizeImageBuffer, validateImageMagicBytes } from "../lib/imageSanitize.js";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? "";
const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const JWT_TTL_SECONDS = 60 * 60 * 24 * 30;
const ALLOWED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const BLOCKED_UPLOAD_TYPES = new Set(["image/svg+xml", "image/svg", "text/xml", "application/xml"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ANTI_SPAM_WINDOW_MS = 15 * 60 * 1000;
const ANTI_SPAM_MAX_PER_WINDOW = 5;

const antiSpamStore = new Map<string, number[]>();

type Ctx = { prisma: any };

type JwtClaims = {
  sub: string;
  role: Role;
  exp: number;
  iat: number;
};

function signJwt(claims: { sub: string; role: Role }): string {
  return jwt.sign({ sub: claims.sub, role: claims.role }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: JWT_TTL_SECONDS,
  });
}

function getBearerToken(req: ApiRequest): string | null {
  const auth = req.headers.authorization;
  const v = Array.isArray(auth) ? auth[0] : auth;
  if (!v?.startsWith("Bearer ")) return null;
  return v.slice(7);
}

function getRequestIp(req: ApiRequest): string {
  return req.ipAddress ?? "unknown";
}

function enforceAntiSpam(req: ApiRequest, action: string, target: string): ApiResponse | null {
  const now = Date.now();
  const bucket = `${action}:${target}:${getRequestIp(req)}`;
  const attempts = antiSpamStore.get(bucket) ?? [];
  const recent = attempts.filter((stamp) => now - stamp < ANTI_SPAM_WINDOW_MS);
  if (recent.length >= ANTI_SPAM_MAX_PER_WINDOW) {
    return { statusCode: 429, body: { error: "rate_limited", message: "Too many requests, please try again later" } };
  }

  recent.push(now);
  antiSpamStore.set(bucket, recent);
  return null;
}

async function verifyClerkJwt(token: string): Promise<JwtClaims | null> {
  if (!CLERK_SECRET_KEY) return null;
  try {
    const verified = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    const claims = verified as any;
    const normalizedRole =
      typeof claims.role === "string" && ["member", "provider", "agency", "admin", "dev", "service"].includes(claims.role)
        ? claims.role
        : "member";
    return {
      sub: claims.sub,
      role: normalizedRole,
      exp: claims.exp,
      iat: claims.iat ?? 0,
    };
  } catch (err) {
    return null;
  }
}

async function requireUser(req: ApiRequest, prisma: any): Promise<any | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const payload = await verifyClerkJwt(token);
  if (!payload?.sub) return null;
  
  // Try to find user by clerk_id or fallback to trying id if they matched
  let user = await prisma.user.findFirst({ where: { clerk_id: payload.sub } });
  if (!user) {
    user = await prisma.user.findUnique({ where: { id: payload.sub } });
  }
  return user;
}

const ENTITY_DEFAULT_SORT_COLUMNS: Record<string, string> = {
  Provider: "created_date",
  Booking: "created_date",
  Message: "created_date",
  Review: "created_date",
  Verification: "createdAt",
};

function parseSort(sort?: string | null, entity?: string): any {
  if (!sort) {
    const column = (entity && ENTITY_DEFAULT_SORT_COLUMNS[entity]) ?? "created_date";
    return { [column]: "desc" };
  }
  const desc = sort.startsWith("-");
  const requested = desc ? sort.slice(1) : sort;
  // Translate legacy "created_date" / "updated_date" to camelCase columns
  // for tables that don't define them.
  const camelMap: Record<string, string> = {
    created_date: "createdAt",
    updated_date: "updatedAt",
  };
  const useCamel = entity === "Verification" && camelMap[requested];
  const key = useCamel ? camelMap[requested] : requested;
  return { [key]: desc ? "desc" : "asc" };
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, stored] = String(storedHash).split(":");
  if (!salt || !stored) return false;

  let storedBuf: Buffer;
  try {
    storedBuf = Buffer.from(stored, "hex");
  } catch {
    return false;
  }

  const computed = crypto.scryptSync(password, salt, 64);
  if (computed.length !== storedBuf.length) return false;
  return timingSafeEqual(computed, storedBuf);
}

const CLERK_METADATA_ROLES = new Set<Role>(["member", "provider", "agency"]);

function clerkRoleFromMetadata(metadata: unknown): Role | null {
  const role = (metadata as { role?: unknown } | null)?.role;
  if (typeof role === "string" && CLERK_METADATA_ROLES.has(role as Role)) {
    return role as Role;
  }
  return null;
}

const ENTITY_WHERE_ALLOWLIST: Record<string, Set<string>> = {
  Provider: new Set(["id"]),
  Booking: new Set(["id"]),
  Message: new Set(["id"]),
  Review: new Set(["id"]),
  Verification: new Set(["id"]),
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseAllowlistedWhere(entity: string, whereRaw?: string | null): any | ApiResponse {
  if (!whereRaw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(whereRaw);
  } catch {
    return { statusCode: 400, body: { error: "invalid_where" } };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { statusCode: 400, body: { error: "invalid_where" } };
  }

  const allowlist = ENTITY_WHERE_ALLOWLIST[entity];
  if (!allowlist) {
    return { statusCode: 400, body: { error: "invalid_where" } };
  }

  const obj = parsed as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!allowlist.has(key)) {
      return { statusCode: 400, body: { error: "invalid_where_field", field: key } };
    }
  }

  if (typeof obj.id === "string" && !isUuid(obj.id)) {
    return { statusCode: 400, body: { error: "invalid_where" } };
  }

  return obj;
}

function normalizeDates<T extends Record<string, any>>(obj: T): T {
  const out: any = obj;
  if (out.created_date && !out.created_at) out.created_at = out.created_date;
  if (out.updated_date && !out.updated_at) out.updated_at = out.updated_date;
  return out as T;
}

function modelFor(entity: string): string | null {
  if (["Provider", "Booking", "Message", "Review", "Verification"].includes(entity)) return entity;
  return null;
}

const PUBLIC_PROVIDER_FIELDS = {
  id: true,
  display_name: true,
  tagline: true,
  bio: true,
  location_city: true,
  location_state: true,
  location_country: true,
  age: true,
  verification_provider: true,
  verification_username: true,
  verification_url: true,
  review_provider: true,
  review_username: true,
  review_url: true,
  photos: true,
  is_premium: true,
  is_verified: true,
  views_count: true,
  rating_average: true,
  reviews_count: true,
  rate_hourly: true,
  created_date: true,
  updated_date: true,
} as const;

const PUBLIC_PROVIDER_DETAIL_CONTACT_FIELDS = {
  phone: true,
  email: true,
} as const;

const OWNER_PROVIDER_FIELDS = {
  user_id: true,
  phone: true,
  email: true,
  status: true,
  pending_photos: true,
  verification_documents: true,
  rejection_reason: true,
  video_url: true,
  social_media: true,
  ad_package: true,
  ad_package_expiry: true,
  is_profile_approved: true,
} as const;

function hasRole(request: ApiRequest, role: Role): boolean {
  return request.auth?.roles.includes(role) ?? false;
}

function isAdmin(request: ApiRequest): boolean {
  return hasRole(request, "admin") || hasRole(request, "service");
}

function isProvider(request: ApiRequest): boolean {
  return hasRole(request, "provider");
}

function getAuthUserId(request: ApiRequest): string | null {
  return request.auth?.userId ?? null;
}

async function resolveOwnedProviderIds(prisma: any, userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const rows = await prisma.provider.findMany({ where: { user_id: userId }, select: { id: true } });
  return rows.map((row: { id: string }) => row.id);
}

async function buildEntityScope(
  req: ApiRequest,
  entity: string,
  prisma: any,
): Promise<{ where?: any; select?: any; enrichOwned?: boolean } | ApiResponse> {
  if (entity === "Provider") {
    const publicVisibilityWhere = publicProviderVisibilityWhere();

    if (isAdmin(req)) {
      return {};
    }

    const userId = getAuthUserId(req);
    if (userId && (isProvider(req) || hasRole(req, "member"))) {
      return {
        where: {
          OR: [
            { user_id: userId },
            publicVisibilityWhere,
          ],
        },
        select: PUBLIC_PROVIDER_FIELDS,
        enrichOwned: true,
      };
    }

    return {
      where: publicVisibilityWhere,
      select: PUBLIC_PROVIDER_FIELDS,
    };
  }

  if (entity === "Booking" || entity === "Message") {
    if (isAdmin(req)) {
      return {};
    }

    const userId = getAuthUserId(req);
    if (!userId) {
      return { statusCode: 401, body: { error: "unauthorized" } };
    }

    const providerIds = await resolveOwnedProviderIds(prisma, userId);
    if (providerIds.length === 0) {
      return { where: { id: { in: [] } } };
    }

    return { where: { provider_id: { in: providerIds } } };
  }

  if (entity === "Review") {
    if (isAdmin(req)) {
      return {};
    }

    const userId = getAuthUserId(req);
    if (!userId) {
      return { where: { status: "approved" } };
    }

    const providerIds = await resolveOwnedProviderIds(prisma, userId);
    if (providerIds.length === 0) {
      return { where: { status: "approved" } };
    }

    return {
      where: {
        OR: [
          { status: "approved" },
          { provider_id: { in: providerIds } },
        ],
      },
    };
  }

  if (entity === "Verification") {
    if (isAdmin(req)) {
      return {};
    }

    const userId = getAuthUserId(req);
    if (!userId) {
      return { statusCode: 401, body: { error: "unauthorized" } };
    }

    return { where: { userId } };
  }

  return {};
}

async function enrichOwnedProviderRows(
  prisma: any,
  rows: Array<Record<string, unknown>>,
  userId: string | null,
): Promise<Array<Record<string, unknown>>> {
  if (!userId || rows.length === 0) return rows;

  const rowIds = rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
  if (rowIds.length === 0) return rows;

  const privilegedRows = await prisma.provider.findMany({
    where: { id: { in: rowIds }, user_id: userId },
    select: { ...PUBLIC_PROVIDER_FIELDS, ...OWNER_PROVIDER_FIELDS },
  });
  if (privilegedRows.length === 0) return rows;

  const privilegedById = new Map(privilegedRows.map((row: Record<string, unknown>) => [row.id, row]));
  return rows.map((row) => {
    const privileged = privilegedById.get(row.id);
    return privileged ? { ...row, ...privileged } : row;
  });
}

function combineWhere(...parts: Array<any | undefined>): any {
  const filtered = parts.filter((part) => part && Object.keys(part).length > 0);
  if (filtered.length === 0) return {};
  if (filtered.length === 1) return filtered[0];
  return { AND: filtered };
}

function resolveProviderPublicSelect(
  entity: string,
  requestedWhere: Record<string, unknown>,
  scopedSelect?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (entity !== "Provider") return scopedSelect;
  if (typeof requestedWhere.id !== "string") return scopedSelect;
  return {
    ...publicProviderProfileSelect,
    ...PUBLIC_PROVIDER_DETAIL_CONTACT_FIELDS,
  };
}

function validationError(error: z.ZodError): ApiResponse {
  return {
    statusCode: 400,
    body: {
      error: "validation_error",
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    },
  };
}

function deriveProviderState(input: Record<string, any>, existing?: Record<string, any> | null, options?: { isAdmin?: boolean }) {
  const isAdmin = options?.isAdmin ?? false;
  const adPackage = isAdmin ? (input.ad_package ?? existing?.ad_package ?? "none") : (existing?.ad_package ?? "none");
  const isPremium = ["featured", "premium", "elite"].includes(adPackage);
  const requestedStatus = typeof input.status === "string" ? input.status : null;

  let nextStatus = existing?.status ?? "pending_verification";
  if (isAdmin) {
    nextStatus = requestedStatus ?? nextStatus;
  } else if (existing?.is_profile_approved && (requestedStatus === "active" || requestedStatus === "paused")) {
    nextStatus = requestedStatus;
  }

  return {
    ...input,
    ad_package: adPackage,
    ad_package_expiry: isAdmin ? (input.ad_package_expiry ?? existing?.ad_package_expiry ?? null) : (existing?.ad_package_expiry ?? null),
    ad_package_started_at: isAdmin ? (input.ad_package_started_at ?? existing?.ad_package_started_at ?? null) : (existing?.ad_package_started_at ?? null),
    ad_package_expiration_reminder_sent_at: isAdmin ? (input.ad_package_expiration_reminder_sent_at ?? existing?.ad_package_expiration_reminder_sent_at ?? null) : (existing?.ad_package_expiration_reminder_sent_at ?? null),
    is_premium: isPremium,
    status: nextStatus,
    photos: isAdmin
      ? (Array.isArray(input.photos) ? input.photos : (existing?.photos ?? []))
      : (existing?.photos ?? []),
    pending_photos: Array.isArray(input.pending_photos) ? input.pending_photos : (existing?.pending_photos ?? []),
    verification_documents: Array.isArray(input.verification_documents)
      ? input.verification_documents
      : (existing?.verification_documents ?? []),
  };
}

export async function registerHandler(req: ApiRequest, { prisma }: Ctx): Promise<ApiResponse> {
  const parsed = registerSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(parsed.error);

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const fullName = (parsed.data.full_name ?? parsed.data.fullName ?? email.split("@")[0] ?? "User").trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { statusCode: 409, body: { error: "email_exists" } };

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");

  const user = await prisma.user.create({
    data: { email, role: "member", status: "active", full_name: fullName, password_hash: `${salt}:${hash}` },
  });

  const token = signJwt({ sub: user.id, role: user.role as Role });
  const { password_hash: _, ...safeUserR } = user as any;
  return { statusCode: 200, body: { token, user: normalizeDates(safeUserR) } };
}

export async function loginHandler(req: ApiRequest, { prisma }: Ctx): Promise<ApiResponse> {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(parsed.error);

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password_hash) return { statusCode: 401, body: { error: "invalid_credentials" } };

  const [salt, stored] = String(user.password_hash).split(":");
  if (!verifyPassword(password, `${salt}:${stored}`)) {
    return { statusCode: 401, body: { error: "invalid_credentials" } };
  }

  const token = signJwt({ sub: user.id, role: user.role as Role });
  const { password_hash: _l, ...safeUserL } = user as any;
  return { statusCode: 200, body: { token, user: normalizeDates(safeUserL) } };
}

import { createClerkClient } from "@clerk/backend";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY || "" });

export async function meHandler(req: ApiRequest, { prisma }: Ctx): Promise<ApiResponse> {
  const token = getBearerToken(req);
  if (!token) return { statusCode: 401, body: { error: "unauthorized" } };

  // Support both Clerk JWT (UI path) and legacy local JWT (API path).
  const clerkPayload = await verifyClerkJwt(token);
  let user = null;

  if (clerkPayload?.sub) {
    user = await prisma.user.findFirst({ where: { clerk_id: clerkPayload.sub } });

    if (user) {
      try {
        const clerkUser = await clerkClient.users.getUser(clerkPayload.sub);
        const clerkRole = clerkRoleFromMetadata(clerkUser.publicMetadata);
        if (clerkRole && clerkRole !== user.role) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { role: clerkRole },
          });
        }
      } catch (_) {}
    } else {
      // Sync new user from Clerk
      try {
        const clerkUser = await clerkClient.users.getUser(clerkPayload.sub);
        const email = clerkUser.emailAddresses[0]?.emailAddress;
        const clerkRole = clerkRoleFromMetadata(clerkUser.publicMetadata) ?? "member";
        if (email) {
          user = await prisma.user.findUnique({ where: { email } });
          if (user) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { clerk_id: clerkPayload.sub }
            });
          } else {
            user = await prisma.user.create({
              data: {
                clerk_id: clerkPayload.sub,
                email: email,
                role: clerkRole,
                full_name: clerkUser.firstName ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim() : null
              }
            });
          }
        }
      } catch (e) {
        console.error("Clerk sync error:", e);
      }
    }
  } else if (req.auth?.userId) {
    user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  }

  if (!user) return { statusCode: 401, body: { error: "unauthorized" } };
  const { password_hash: _m, ...safeUserM } = user as any;
  return { statusCode: 200, body: normalizeDates(safeUserM) };
}

export async function logoutHandler(): Promise<ApiResponse> {
  return { statusCode: 200, body: { ok: true } };
}

export async function listOrFilterEntityHandler(req: ApiRequest, entity: string, { prisma }: Ctx): Promise<ApiResponse> {
  const model = modelFor(entity);
  if (!model) return { statusCode: 404, body: { error: "unknown_entity" } };

  const requestedWhere = parseAllowlistedWhere(entity, req.query.get("where"));
  if ("statusCode" in requestedWhere) {
    return requestedWhere;
  }

  const sort = req.query.get("sort");
  const limit = Number(req.query.get("limit") ?? 100);
  const scoped = await buildEntityScope(req, entity, prisma);
  if ("statusCode" in scoped) {
    return scoped;
  }

  const rows = await prisma[model.toLowerCase()].findMany({
    where: combineWhere(scoped.where, requestedWhere),
    select: resolveProviderPublicSelect(entity, requestedWhere, scoped.select),
    orderBy: parseSort(sort, entity),
    take: Number.isFinite(limit) ? Math.min(limit, 1000) : 100,
  });

  let normalized = rows.map((r: any) => normalizeDates(r));
  if (entity === "Provider" && scoped.enrichOwned) {
    normalized = await enrichOwnedProviderRows(prisma, normalized, getAuthUserId(req));
  } else if (entity === "Provider") {
    const exposeImportedContact = Boolean(requestedWhere?.id);
    normalized = normalized.map((row: Record<string, unknown>) =>
      sanitizeProviderContactForAudience(row, { exposeImportedContact }),
    );
  }

  return { statusCode: 200, body: normalized };
}

export async function createEntityHandler(req: ApiRequest, entity: string, { prisma }: Ctx): Promise<ApiResponse> {
  const model = modelFor(entity);
  if (!model) return { statusCode: 404, body: { error: "unknown_entity" } };

  const rawData = { ...((req.body ?? {}) as any) };

  if (entity === "Provider") {
    if (!req.auth?.userId) return { statusCode: 401, body: { error: "unauthorized" } };
    const parsed = providerCreateSchema.safeParse(rawData);
    if (!parsed.success) return validationError(parsed.error);

    const isAdmin = hasRole(req, "admin");
    if (!isAdmin && parsed.data.user_id !== req.auth.userId) {
      return { statusCode: 403, body: { error: "forbidden", message: "Can only create provider for your own account" } };
    }

    const data = deriveProviderState(parsed.data, null, { isAdmin });
    const created = await prisma.provider.create({ data });

    // Fix race condition: if ID verification was already approved before the
    // provider record existed, apply the approval now.
    console.log("[racefix] Checking for approved verification for user_id:", parsed.data.user_id);
    const approvedVerification = await prisma.verification.findFirst({
      where: { userId: parsed.data.user_id, status: "approved" },
      orderBy: { createdAt: "desc" },
    });
    console.log("[racefix] Found:", approvedVerification?.id ?? "none");
    if (approvedVerification) {
      const updated = await prisma.provider.update({
        where: { id: created.id },
        data: {
          is_verified: true,
          is_profile_approved: true,
          status: "active",
          rejection_reason: null,
        },
      });
      return { statusCode: 200, body: normalizeDates(updated) };
    }

    return { statusCode: 200, body: normalizeDates(created) };
  }

  if (entity === "Booking") {
    const parsed = bookingCreateSchema.safeParse(rawData);
    if (!parsed.success) return validationError(parsed.error);

    const spam = enforceAntiSpam(req, "booking.create", parsed.data.provider_id);
    if (spam) return spam;

    const created = await prisma.booking.create({ data: parsed.data });
    return { statusCode: 200, body: normalizeDates(created) };
  }

  if (entity === "Message") {
    const parsed = messageCreateSchema.safeParse(rawData);
    if (!parsed.success) return validationError(parsed.error);

    const spam = enforceAntiSpam(req, "message.create", parsed.data.provider_id);
    if (spam) return spam;

    const created = await prisma.message.create({ data: parsed.data });
    return { statusCode: 200, body: normalizeDates(created) };
  }

  if (entity === "Review") {
    if (!req.auth?.userId) return { statusCode: 401, body: { error: "unauthorized" } };

    const parsed = reviewCreateSchema.safeParse(rawData);
    if (!parsed.success) return validationError(parsed.error);

    const created = await prisma.review.create({
      data: {
        ...parsed.data,
        reviewer_name: parsed.data.reviewer_name ?? "Authenticated user",
      },
    });
    return { statusCode: 200, body: normalizeDates(created) };
  }

  if (entity === "Verification") {
    if (!req.auth?.userId) return { statusCode: 401, body: { error: "unauthorized" } };

    const parsed = verificationCreateSchema.safeParse(rawData);
    if (!parsed.success) return validationError(parsed.error);

    const created = await prisma.verification.create({
      data: {
        userId: req.auth.userId,
        type: parsed.data.type,
        status: "pending",
      },
    });
    return { statusCode: 200, body: normalizeDates(created) };
  }

  const created = await prisma[model.toLowerCase()].create({ data: rawData });
  return { statusCode: 200, body: normalizeDates(created) };
}

export async function updateProviderHandler(req: ApiRequest, id: string, ctx: Ctx): Promise<ApiResponse> {
  const { prisma } = ctx;
  if (!req.auth?.userId) return { statusCode: 401, body: { error: "unauthorized" } };

  const existing = await prisma.provider.findUnique({ where: { id } });
  if (!existing) return { statusCode: 404, body: { error: "not_found" } };

  const isAdmin = hasRole(req, "admin");
  const parsed = (isAdmin ? providerAdminUpdateSchema : providerUpdateSchema).safeParse({ ...((req.body ?? {}) as any) });
  if (!parsed.success) return validationError(parsed.error);

  if (!isAdmin && existing.user_id !== req.auth.userId) {
    return { statusCode: 403, body: { error: "forbidden", message: "Can only update your own provider" } };
  }

  const data = deriveProviderState(parsed.data, existing, { isAdmin });
  const updated = await prisma.provider.update({ where: { id }, data });

  // Audit admin moderation actions on Provider (state changes, package
  // assignments, photo approvals). Owner self-edits skip the audit log
  // to keep volume manageable.
  if (isAdmin && (ctx as any).auditLogger) {
    try {
      const diff: Record<string, unknown> = {};
      const fields = [
        "status",
        "is_verified",
        "is_profile_approved",
        "ad_package",
        "ad_package_expiry",
        "admin_notes",
        "rejection_reason",
      ];
      for (const f of fields) {
        if ((parsed.data as any)[f] !== undefined && (existing as any)[f] !== (parsed.data as any)[f]) {
          diff[f] = { from: (existing as any)[f] ?? null, to: (parsed.data as any)[f] };
        }
      }
      const beforePhotos = Array.isArray(existing.photos) ? existing.photos.length : 0;
      const afterPhotos = Array.isArray(updated.photos) ? updated.photos.length : 0;
      if (beforePhotos !== afterPhotos) {
        diff.photos_count = { from: beforePhotos, to: afterPhotos };
      }
      if (Object.keys(diff).length > 0) {
        await (ctx as any).auditLogger.append({
          actorId: req.auth.userId,
          action: "admin.provider.update",
          resourceType: "provider",
          resourceId: id,
          metadata: { diff },
        });
      }
    } catch {
      // Audit logging errors must never block the write path.
    }
  }

  return { statusCode: 200, body: normalizeDates(updated) };
}

function decodeBase64Payload(data: string): Buffer {
  const b64 = data.includes(",") ? data.split(",", 2)[1] : data;
  return Buffer.from(b64, "base64");
}

export async function uploadHandler(req: ApiRequest): Promise<ApiResponse> {
  if (!req.auth?.userId) {
    return { statusCode: 401, body: { error: "unauthorized" } };
  }

  const parsed = uploadSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(parsed.error);

  if (!ALLOWED_UPLOAD_TYPES.has(parsed.data.contentType) || BLOCKED_UPLOAD_TYPES.has(parsed.data.contentType)) {
    return { statusCode: 400, body: { error: "unsupported_media_type" } };
  }

  let fileBuffer = decodeBase64Payload(parsed.data.data);
  if (fileBuffer.length === 0) {
    return { statusCode: 400, body: { error: "missing_data" } };
  }

  if (!validateImageMagicBytes(fileBuffer, parsed.data.contentType)) {
    return { statusCode: 400, body: { error: "invalid_image_data" } };
  }

  let outputContentType = parsed.data.contentType;
  try {
    const sanitized = await sanitizeImageBuffer(fileBuffer, parsed.data.contentType);
    fileBuffer = sanitized.buffer;
    outputContentType = sanitized.contentType;
  } catch {
    return { statusCode: 400, body: { error: "invalid_image_data" } };
  }

  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    return { statusCode: 413, body: { error: "file_too_large", maxBytes: MAX_UPLOAD_BYTES } };
  }

  try {
    const uploaded = await storeUpload({
      filename: parsed.data.filename,
      contentType: outputContentType,
      fileBuffer,
    });

    return { statusCode: 200, body: { file_url: uploaded.fileUrl } };
  } catch (error) {
    console.error("Upload failed", error);
    return { statusCode: 500, body: { error: "upload_failed" } };
  }
}

export async function videoUploadHandler(req: ApiRequest): Promise<ApiResponse> {
  if (!req.auth?.userId) {
    return { statusCode: 401, body: { error: "unauthorized" } };
  }

  // Check body - parse multipart
  // The request body arrives as a raw Buffer from the server
  const body = (req as any).rawBody;
  if (!body || !Buffer.isBuffer(body) || body.length === 0) {
    return { statusCode: 400, body: { error: "missing_body", message: "Send file as multipart/form-data with field name 'file'" } };
  }

  const contentType = req.headers["content-type"];
  const ct = Array.isArray(contentType) ? contentType[0] : contentType;
  if (!ct || !ct.includes("multipart/form-data")) {
    return { statusCode: 400, body: { error: "invalid_content_type", message: "Use multipart/form-data" } };
  }

  // Parse boundary from content-type
  const boundaryMatch = ct.match(/boundary=([^;]+)/);
  if (!boundaryMatch) {
    return { statusCode: 400, body: { error: "missing_boundary" } };
  }
  const boundary = boundaryMatch[1].trim();

  try {
    // Parse multipart
    const busboy = require("busboy");
    const bb = busboy({ headers: { "content-type": ct } });
    
    return new Promise<ApiResponse>((resolve) => {
      let fileBuffer: Buffer | null = null;
      let filename = "video.mp4";
      let fileMimeType = "video/mp4";

      bb.on("file", (fieldname: string, file: any, info: { filename: string; encoding: string; mimeType: string }) => {
        filename = info.filename;
        fileMimeType = info.mimeType;
        const chunks: Buffer[] = [];
        file.on("data", (chunk: Buffer) => chunks.push(chunk));
        file.on("end", () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });

      bb.on("finish", async () => {
        if (!fileBuffer || fileBuffer.length === 0) {
          resolve({ statusCode: 400, body: { error: "no_file", message: "No file uploaded. Field name should be 'file'." } });
          return;
        }

        if (!isAllowedVideoType(fileMimeType)) {
          resolve({ statusCode: 400, body: { error: "unsupported_video_type" } });
          return;
        }

        if (fileBuffer.length > MAX_VIDEO_BYTES) {
          resolve({ statusCode: 413, body: { error: "file_too_large", maxBytes: MAX_VIDEO_BYTES } });
          return;
        }

        try {
          const uploaded = await storeVideo({
            filename,
            contentType: fileMimeType,
            fileBuffer,
          });
          resolve({ statusCode: 200, body: { file_url: uploaded.fileUrl, storage_key: uploaded.storageKey } });
        } catch (err) {
          console.error("Video upload failed", err);
          resolve({ statusCode: 500, body: { error: "video_upload_failed" } });
        }
      });

      bb.on("error", (err: Error) => {
        console.error("Busboy error", err);
        resolve({ statusCode: 400, body: { error: "parse_error" } });
      });

      bb.end(body);
    });
  } catch (err) {
    console.error("Video upload init failed", err);
    return { statusCode: 500, body: { error: "video_upload_init_failed" } };
  }
}
