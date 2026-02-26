export interface AuditEventInput {
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogger {
  append(event: AuditEventInput): Promise<void>;
}

export class ImmutableAuditLogger implements AuditLogger {
  async append(event: AuditEventInput): Promise<void> {
    const logLine = JSON.stringify({
      ...event,
      occurredAt: new Date().toISOString(),
    });

    // Phase 0 stub: append-only output sink placeholder.
    process.stdout.write(`[audit] ${logLine}\n`);
  }
}
