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
  private readonly prisma?: any;

  constructor(prisma?: any) {
    this.prisma = prisma;
  }

  async append(event: AuditEventInput): Promise<void> {
    if (this.prisma) {
      try {
        await this.prisma.auditEvent.create({
          data: {
            actorId: event.actorId,
            action: event.action,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            payload: event.metadata ?? {},
          },
        });
      } catch {
        // Keep API path resilient if audit persistence fails.
      }
    }

    const logLine = JSON.stringify({
      ...event,
      occurredAt: new Date().toISOString(),
    });

    // Phase 0 stub: append-only output sink placeholder.
    process.stdout.write(`[audit] ${logLine}\n`);
  }
}
