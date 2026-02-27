export type Role = "admin" | "provider" | "member" | "service";

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
  auth?: AuthContext;
  body?: unknown;
}

export interface ApiResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
}
