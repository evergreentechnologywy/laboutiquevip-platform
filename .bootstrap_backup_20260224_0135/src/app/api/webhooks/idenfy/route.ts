import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export async function POST(req: NextRequest) {
  const body = await req.text();
  const externalEventId = req.headers.get('x-idenfy-event-id') || crypto.randomUUID();
  await prisma.verificationEvent.create({ data: { provider: 'idenfy', externalEventId, payload: { raw: body } } }).catch(() => {});
  return NextResponse.json({ received: true });
}
