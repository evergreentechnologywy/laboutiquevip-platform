import { Queue } from 'bullmq';
import { redis } from './redis';
export const webhookQueue = new Queue('webhooks', { connection: redis });
export const auditQueue = new Queue('audit', { connection: redis });
