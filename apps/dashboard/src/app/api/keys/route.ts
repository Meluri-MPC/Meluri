import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 400 });

  const developer = await prisma.developer.findUnique({ where: { email } });
  if (!developer) return NextResponse.json({ error: 'Developer not found' }, { status: 404 });

  const count = await prisma.apiKey.count({ where: { developerId: developer.id, status: 'Active' } });
  if (count >= 5) return NextResponse.json({ error: 'Max 5 active keys' }, { status: 400 });

  const { name } = await req.json();
  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const rawKey = `ml_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const apiKey = await prisma.apiKey.create({
    data: { developerId: developer.id, name, keyHash, keyPrefix: rawKey.slice(0, 10) },
  });

  return NextResponse.json({
    id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix,
    rawKey, status: apiKey.status, createdAt: apiKey.createdAt,
  });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 400 });

  const developer = await prisma.developer.findUnique({ where: { email } });
  if (!developer) return NextResponse.json({ error: 'Developer not found' }, { status: 404 });

  const keyId = req.nextUrl.pathname.split('/').pop();
  if (!keyId) return NextResponse.json({ error: 'Key ID required' }, { status: 400 });

  await prisma.apiKey.updateMany({
    where: { id: keyId, developerId: developer.id },
    data: { status: 'Revoked' },
  });

  return NextResponse.json({ success: true });
}
