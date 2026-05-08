import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const developer = await prisma.developer.findUnique({ where: { email: `clerk:${userId}` } });
  if (!developer) return NextResponse.json({ error: 'Developer not found' }, { status: 404 });

  const { apiKeyId, appName, allowedDomains } = await req.json();

  const apiKey = await prisma.apiKey.findFirst({
    where: { id: apiKeyId, developerId: developer.id },
  });
  if (!apiKey) return NextResponse.json({ error: 'API key not found' }, { status: 404 });

  const existing = await prisma.mpcOrganization.findUnique({ where: { apiKeyId } });
  if (existing) return NextResponse.json({ error: 'MPC already provisioned' }, { status: 400 });

  // Provision via Meluri API backend (which calls Turnkey)
  try {
    const meluriApiUrl = process.env.MELURI_API_URL || 'http://localhost:4002/api/v1';
    const res = await fetch(`${meluriApiUrl}/auth/mpc/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': `ml_placeholder` },
      body: JSON.stringify({ appName, allowedDomains }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'MPC provisioning failed' }));
      throw new Error((err as any).message);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
