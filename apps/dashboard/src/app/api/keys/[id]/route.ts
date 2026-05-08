import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const developer = await prisma.developer.findUnique({ where: { email: `clerk:${userId}` } });
  if (!developer) return NextResponse.json({ error: 'Developer not found' }, { status: 404 });

  const keyId = req.nextUrl.pathname.match(/\/keys\/([^/]+)/)?.[1];
  if (!keyId) return NextResponse.json({ error: 'Key ID required' }, { status: 400 });

  await prisma.apiKey.updateMany({
    where: { id: keyId, developerId: developer.id },
    data: { status: 'Revoked' },
  });

  return NextResponse.json({ success: true });
}
