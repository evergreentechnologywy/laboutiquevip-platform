export type Role = "admin" | "provider" | "member" | "service";

export interface AuthContext {
  userId: string | null;
  roles: Role[];
}

export interface ApiRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthContext;
  body?: unknown;
}

export interface ApiResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
}
