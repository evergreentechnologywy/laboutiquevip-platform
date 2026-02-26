import type { ApiResponse } from "../types.js";

export function healthHandler(): ApiResponse {
  return {
    statusCode: 200,
    body: {
      ok: true,
      service: "trystlike-backend",
      phase: "0",
      timestamp: new Date().toISOString(),
    },
  };
}
