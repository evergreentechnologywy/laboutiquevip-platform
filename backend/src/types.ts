export type Role = "admin" | "dev" | "provider" | "agency" | "member" | "service";

export interface AuthContext {
  /** Internal User.id (UUID). Use this for any Prisma query against UUID columns. */
  userId: string | null;
  /** Clerk user id (e.g. `user_xxx`). Set when authenticated via Clerk JWT. */
  clerkId?: string | null;
  roles: Role[];
}

export interface ApiRequest {
  method: string;
  path: string;
  pathname: string;
  query: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  ipAddress: string | null;
  requestId: string;
  rawBody: string | null;
  /** Binary raw body for multipart uploads (video, etc.) */
  rawBuffer?: Buffer;
  auth?: AuthContext;
  body?: unknown;
}

export interface ApiResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
  /** Binary response body (preferred for images, video, file downloads). */
  rawBuffer?: Buffer;
}
