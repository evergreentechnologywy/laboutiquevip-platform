import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ApiRequest, ApiResponse } from "../types.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/srv/apps/trystlike/repo/backend/uploads";
const PUBLIC_UPLOAD_BASE = process.env.PUBLIC_UPLOAD_BASE ?? "/uploads";

type Ctx = { prisma: any };

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

function verifyJwt(token: string): any | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64url(crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest());
  if (expected !== s) return null;
  const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  return payload;
}

function getBearerToken(req: ApiRequest): string | null {
  const auth = req.headers.authorization;
  const v = Array.isArray(auth) ? auth[0] : auth;
  if (!v?.startsWith("Bearer ")) return null;
  return v.slice(7);
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

export async function registerHandler(req: ApiRequest, { prisma }: Ctx): Promise<ApiResponse> {
  const body = (req.body ?? {}) as any;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? body.fullName ?? email.split("@")[0] ?? "User");

  if (!email || !password) return { statusCode: 400, body: { error: "email_and_password_required" } };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { statusCode: 409, body: { error: "email_exists" } };

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");

  const user = await prisma.user.create({
    data: { email, role: "member", status: "active", full_name: fullName, password_hash: `${salt}:${hash}` },
  });

  const token = signJwt({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 });
  return { statusCode: 200, body: { token, user: normalizeDates(user) } };
}

export async function loginHandler(req: ApiRequest, { prisma }: Ctx): Promise<ApiResponse> {
  const body = (req.body ?? {}) as any;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password_hash) return { statusCode: 401, body: { error: "invalid_credentials" } };

  const [salt, stored] = String(user.password_hash).split(":");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  if (hash !== stored) return { statusCode: 401, body: { error: "invalid_credentials" } };

  const token = signJwt({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 });
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

  const data = { ...((req.body ?? {}) as any) };
  const created = await prisma[model.toLowerCase()].create({ data });
  return { statusCode: 200, body: normalizeDates(created) };
}

export async function updateProviderHandler(req: ApiRequest, id: string, { prisma }: Ctx): Promise<ApiResponse> {
  const data = { ...((req.body ?? {}) as any) };
  const updated = await prisma.provider.update({ where: { id }, data });
  return { statusCode: 200, body: normalizeDates(updated) };
}

export async function uploadHandler(req: ApiRequest): Promise<ApiResponse> {
  const body = (req.body ?? {}) as any;
  const filename = String(body.filename ?? `upload-${Date.now()}.bin`);
  const data = String(body.data ?? "");
  if (!data) return { statusCode: 400, body: { error: "missing_data" } };

  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const fullDir = path.resolve(UPLOAD_DIR);
  await fs.mkdir(fullDir, { recursive: true });

  const b64 = data.includes(",") ? data.split(",", 2)[1] : data;
  await fs.writeFile(path.join(fullDir, safeName), Buffer.from(b64, "base64"));

  return { statusCode: 200, body: { file_url: `${PUBLIC_UPLOAD_BASE}/${safeName}` } };
}
