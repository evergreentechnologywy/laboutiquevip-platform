import crypto from "node:crypto";
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
} from "../validation/base44Compat.js";
import { storeUpload } from "../storage/uploads.js";
import { storeVideo, isAllowedVideoType, MAX_VIDEO_BYTES } from "../storage/video.js";
import { publicProviderVisibilityWhere } from "./providerVisibility.js";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? "";
const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const JWT_TTL_SECONDS = 60 * 60 * 24 * 30;
const ALLOWED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
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
      typeof claims.role === "string" && ["member", "provider", "agency", "admin", "service"].includes(claims.role)
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

function parseSort(sort?: string | null): any {
  if (!sort) return { created_date: "desc" };
  const desc = sort.startsWith("-");
  const key = desc ? sort.slice(1) : sort;
  return { [key]: desc ? "desc" : "asc" };
}

function parseWhere(whereRaw?: string | null): any {
  if (!whereRaw) return {};
  try {
    return JSON.parse(whereRaw);
  } catch {
    return {};
  }
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
  phone: true,
  email: true,
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

async function buildEntityScope(req: ApiRequest, entity: string, prisma: any): Promise<{ where?: any; select?: any } | ApiResponse> {
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

function combineWhere(...parts: Array<any | undefined>): any {
  const filtered = parts.filter((part) => part && Object.keys(part).length > 0);
  if (filtered.length === 0) return {};
  if (filtered.length === 1) return filtered[0];
  return { AND: filtered };
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
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  if (hash !== stored) return { statusCode: 401, body: { error: "invalid_credentials" } };

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
      // Sync role from Clerk on each call (picks up elevation changes)
      try {
        const clerkUser = await clerkClient.users.getUser(clerkPayload.sub);
        const metadataRole = (clerkUser.publicMetadata as any)?.role;
        const clerkRole = typeof metadataRole === "string" && ["member", "provider", "agency", "admin", "service"].includes(metadataRole)
          ? metadataRole
          : null;
        if (clerkRole && clerkRole !== user.role) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { role: clerkRole }
          });
        }
      } catch (_) {}
    } else {
      // Sync new user from Clerk
      try {
        const clerkUser = await clerkClient.users.getUser(clerkPayload.sub);
        const email = clerkUser.emailAddresses[0]?.emailAddress;
        const metadataRole = (clerkUser.publicMetadata as any)?.role;
        const clerkRole = typeof metadataRole === "string" && ["member", "provider", "agency", "admin", "service"].includes(metadataRole)
          ? metadataRole
          : "member";
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

  const requestedWhere = parseWhere(req.query.get("where"));
  const sort = req.query.get("sort");
  const limit = Number(req.query.get("limit") ?? 100);
  const scoped = await buildEntityScope(req, entity, prisma);
  if ("statusCode" in scoped) {
    return scoped;
  }

  const rows = await prisma[model.toLowerCase()].findMany({
    where: combineWhere(scoped.where, requestedWhere),
    select: scoped.select,
    orderBy: parseSort(sort),
    take: Number.isFinite(limit) ? Math.min(limit, 1000) : 100,
  });
  return { statusCode: 200, body: rows.map((r: any) => normalizeDates(r)) };
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

  const created = await prisma[model.toLowerCase()].create({ data: rawData });
  return { statusCode: 200, body: normalizeDates(created) };
}

export async function updateProviderHandler(req: ApiRequest, id: string, { prisma }: Ctx): Promise<ApiResponse> {
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

  if (!ALLOWED_UPLOAD_TYPES.has(parsed.data.contentType)) {
    return { statusCode: 400, body: { error: "unsupported_media_type" } };
  }

  const fileBuffer = decodeBase64Payload(parsed.data.data);
  if (fileBuffer.length === 0) {
    return { statusCode: 400, body: { error: "missing_data" } };
  }

  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    return { statusCode: 413, body: { error: "file_too_large", maxBytes: MAX_UPLOAD_BYTES } };
  }

  try {
    const uploaded = await storeUpload({
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
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
