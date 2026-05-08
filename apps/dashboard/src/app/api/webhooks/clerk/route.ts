import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Webhook } from 'svix';
import { headers } from 'next/headers';

export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) return NextResponse.json({ error: 'Missing webhook secret' }, { status: 500 });

  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  const body = await req.text();

  let evt: any;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    evt = wh.verify(body, { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature });
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const eventType = evt.type;

  if (eventType === 'user.created' || eventType === 'user.updated') {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;
    const email = email_addresses?.[0]?.email_address;
    if (email) {
      await prisma.developer.upsert({
        where: { email },
        update: { name: `${first_name || ''} ${last_name || ''}`.trim(), avatarUrl: image_url },
        create: { email, name: `${first_name || ''} ${last_name || ''}`.trim(), avatarUrl: image_url },
      });
    }
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data;
    const email = evt.data.email_addresses?.[0]?.email_address;
    if (email) {
      await prisma.developer.deleteMany({ where: { email } });
    }
  }

  return NextResponse.json({ success: true });
}
