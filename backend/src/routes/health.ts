import type { ApiResponse } from "../types.js";

const HEALTH_RESPONSE_BODY = {
  ok: true,
  service: "trystlike-backend",
  phase: "0",
};

export function healthHandler(): ApiResponse {
  return {
    statusCode: 200,
    headers: {
      "cache-control": "no-store",
    },
    body: HEALTH_RESPONSE_BODY,
  };
}
