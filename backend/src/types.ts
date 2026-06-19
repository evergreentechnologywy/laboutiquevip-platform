export type Role = "admin" | "provider" | "agency" | "member" | "service";

export interface AuthContext {
  userId: string | null;
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
