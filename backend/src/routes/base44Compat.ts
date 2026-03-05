import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { ApiRequest, ApiResponse, Role } from "../types.js";
import {
  bookingCreateSchema,
  loginSchema,
  messageCreateSchema,
  providerCreateSchema,
  providerUpdateSchema,
  registerSchema,
  reviewCreateSchema,
  uploadSchema,
} from "../validation/base44Compat.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const JWT_TTL_SECONDS = 60 * 60 * 24 * 30;
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/srv/apps/trystlike/repo/backend/uploads";
const PUBLIC_UPLOAD_BASE = process.env.PUBLIC_UPLOAD_BASE ?? "/uploads";
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

function verifyJwt(token: string): JwtClaims | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as JwtClaims;
  } catch {
    return null;
  }
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

async function requireUser(req: ApiRequest, prisma: any): Promise<any | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload?.sub) return null;
  return prisma.user.findUnique({ where: { id: payload.sub } });
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
  if (["Provider", "Booking", "Message", "Review"].includes(entity)) return entity;
  return null;
}

function hasRole(request: ApiRequest, role: Role): boolean {
  return request.auth?.roles.includes(role) ?? false;
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
  return { statusCode: 200, body: { token, user: normalizeDates(user) } };
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
  return { statusCode: 200, body: { token, user: normalizeDates(user) } };
}

export async function meHandler(req: ApiRequest, { prisma }: Ctx): Promise<ApiResponse> {
  const user = await requireUser(req, prisma);
  if (!user) return { statusCode: 401, body: { error: "unauthorized" } };
  return { statusCode: 200, body: normalizeDates(user) };
}

export async function logoutHandler(): Promise<ApiResponse> {
  return { statusCode: 200, body: { ok: true } };
}

export async function listOrFilterEntityHandler(req: ApiRequest, entity: string, { prisma }: Ctx): Promise<ApiResponse> {
  const model = modelFor(entity);
  if (!model) return { statusCode: 404, body: { error: "unknown_entity" } };

  const where = parseWhere(req.query.get("where"));
  const sort = req.query.get("sort");
  const limit = Number(req.query.get("limit") ?? 100);

  const rows = await prisma[model.toLowerCase()].findMany({
    where,
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

    const created = await prisma.provider.create({ data: parsed.data });
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

  const parsed = providerUpdateSchema.safeParse({ ...((req.body ?? {}) as any) });
  if (!parsed.success) return validationError(parsed.error);

  const existing = await prisma.provider.findUnique({ where: { id } });
  if (!existing) return { statusCode: 404, body: { error: "not_found" } };

  const isAdmin = hasRole(req, "admin");
  if (!isAdmin && existing.user_id !== req.auth.userId) {
    return { statusCode: 403, body: { error: "forbidden", message: "Can only update your own provider" } };
  }

  const updated = await prisma.provider.update({ where: { id }, data: parsed.data });
  return { statusCode: 200, body: normalizeDates(updated) };
}

function decodeBase64Payload(data: string): Buffer {
  const b64 = data.includes(",") ? data.split(",", 2)[1] : data;
  return Buffer.from(b64, "base64");
}

export async function uploadHandler(req: ApiRequest): Promise<ApiResponse> {
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

  const safeBaseName = path.basename(parsed.data.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = path.extname(safeBaseName) || ".bin";
  const safeName = `${Date.now()}-${crypto.randomUUID()}${ext}`;

  const fullDir = path.resolve(UPLOAD_DIR);
  await fs.mkdir(fullDir, { recursive: true });

  const targetPath = path.resolve(fullDir, safeName);
  if (!targetPath.startsWith(`${fullDir}${path.sep}`)) {
    return { statusCode: 400, body: { error: "invalid_filename" } };
  }

  await fs.writeFile(targetPath, fileBuffer);

  return { statusCode: 200, body: { file_url: `${PUBLIC_UPLOAD_BASE}/${safeName}` } };
}
