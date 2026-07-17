import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function WalletsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  if (!email) redirect('/sign-in');

  const developer = await prisma.developer.findUnique({ where: { email } });
  if (!developer) redirect('/sign-in');

  const wallets = await prisma.mpcWallet.findMany({
    where: { organization: { apiKey: { developerId: developer.id } } },
    select: {
      id: true, userId: true, stxAddress: true, network: true,
      createdAt: true, lastSyncedAt: true,
      _count: { select: { transactions: true, balances: true } },
      organization: { select: { appName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="animate-fadeIn">
      <h1 className="text-2xl font-bold mb-2">Wallets</h1>
      <p className="text-white/60 mb-8">{wallets.length} wallets created</p>

      {wallets.length === 0 && (
        <div className="bg-[#0d0d0d] border border-white/[0.08] rounded-[14px] p-8 text-center text-white/25">
          No wallets yet. Users will get wallets when they first authenticate with your SDK.
        </div>
      )}

      <div className="space-y-2">
        {wallets.map((w) => (
          <div key={w.id} className="bg-[#0d0d0d] border border-white/[0.08] rounded-[14px] p-4 hover:border-white/[0.14] transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm text-white/80">{w.stxAddress}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  User: {w.userId.slice(0, 12)}... &middot; {w.organization.appName} &middot; {w.network}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/40">
                  {w._count.transactions} txs &middot; {w._count.balances} assets
                </p>
                <p className="text-xs text-white/25">
                  Created {new Date(w.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
