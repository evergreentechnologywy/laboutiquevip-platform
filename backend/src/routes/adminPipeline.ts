import type { ApiRequest, ApiResponse } from "../types.js";

interface AdminPipelineContext {
  prisma: any;
}

/** GET /api/v1/admin/pipeline-runs — paginated pipeline run history (admin). */
export async function adminPipelineRunsHandler(request: ApiRequest, context: AdminPipelineContext): Promise<ApiResponse> {
  try {
    const q = request.query ?? new URLSearchParams();
    const source = q.get("source") || undefined;
    const limit = Math.min(Number(q.get("limit") ?? 20) || 20, 100);
    const offset = Number(q.get("offset") ?? 0) || 0;

    const where: any = {};
    if (source) where.source = source;

    const [runs, total] = await Promise.all([
      context.prisma.pipelineRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      context.prisma.pipelineRun.count({ where }),
    ]);

    return {
      statusCode: 200,
      body: { runs, total, limit, offset },
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: { error: "pipeline_runs_failed", message: err?.message ?? "failed to load pipeline runs" },
    };
  }
}

/** GET /api/admin/audit-events — recent audit events (admin). */
export async function adminAuditEventsHandler(request: ApiRequest, context: AdminPipelineContext): Promise<ApiResponse> {
  try {
    const q = request.query ?? new URLSearchParams();
    const limit = Math.min(Number(q.get("limit") ?? 50) || 50, 200);

    const events = await context.prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return { statusCode: 200, body: { events } };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: { error: "audit_events_failed", message: err?.message ?? "failed to load audit events" },
    };
  }
}
