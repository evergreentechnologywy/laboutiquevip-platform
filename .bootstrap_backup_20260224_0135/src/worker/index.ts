import { Worker } from 'bullmq';
import { redis } from '@/lib/redis';
new Worker('webhooks', async () => {}, { connection: redis });
new Worker('audit', async () => {}, { connection: redis });
console.log('worker started');
