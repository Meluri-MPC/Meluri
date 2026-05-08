import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { ApiKeyManager } from '@/components/api-key-manager';

export default async function ApiKeysPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  if (!email) redirect('/sign-in');

  const developer = await prisma.developer.findUnique({ where: { email } });
  if (!developer) redirect('/sign-in');

  const keys = await prisma.apiKey.findMany({
    where: { developerId: developer.id },
    select: {
      id: true, name: true, keyPrefix: true, status: true,
      lastUsedAt: true, createdAt: true,
      mpcOrg: { select: { appName: true, walletCount: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <ApiKeyManager developerId={developer.id} initialKeys={keys as any} />
      </div>
      <p className="text-gray-400 mb-8">Manage your API keys for SDK integration</p>

      <div className="space-y-3">
        {keys.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            No API keys yet. Create your first one to get started.
          </div>
        )}
        {keys.map((key) => (
          <div key={key.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{key.name}</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {key.keyPrefix}... &middot; Created {new Date(key.createdAt).toLocaleDateString()}
                </p>
                {key.mpcOrg && (
                  <p className="text-xs text-meluri-400 mt-1">
                    MPC enabled — {key.mpcOrg.walletCount} wallets
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  key.status === 'Active'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {key.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
