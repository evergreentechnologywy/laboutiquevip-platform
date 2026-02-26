import { auditQueue } from './queue';
export async function audit(action: string, resourceType: string, resourceId?: string, metadata?: unknown) { await auditQueue.add('audit-event', { action, resourceType, resourceId, metadata }); }
