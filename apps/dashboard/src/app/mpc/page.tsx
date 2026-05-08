import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { MpcConfigForm } from '@/components/mpc-config-form';

export default async function MpcConfigPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  if (!email) redirect('/sign-in');

  const developer = await prisma.developer.findUnique({ where: { email } });
  if (!developer) redirect('/sign-in');

  const apiKeys = await prisma.apiKey.findMany({
    where: { developerId: developer.id, status: 'Active' },
    select: { id: true, name: true, keyPrefix: true, mpcOrg: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">MPC Configuration</h1>
      <p className="text-gray-400 mb-8">Provision Turnkey MPC for your API keys</p>

      <div className="space-y-4">
        {apiKeys.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            Create an API key first before configuring MPC.
          </div>
        )}
        {apiKeys.map((key) => (
          <div key={key.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium">{key.name}</h3>
                <p className="text-sm text-gray-500">{key.keyPrefix}...</p>
              </div>
              {key.mpcOrg ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
                  Active &mdash; {key.mpcOrg.walletCount} wallets
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-400">
                  Not provisioned
                </span>
              )}
            </div>
            {key.mpcOrg ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">App Name:</span> <span className="text-gray-200">{key.mpcOrg.appName}</span></div>
                <div><span className="text-gray-500">Domains:</span> <span className="text-gray-200">{(key.mpcOrg as any).allowedDomains?.join(', ') || 'All'}</span></div>
                <div><span className="text-gray-500">Wallets:</span> <span className="text-gray-200">{key.mpcOrg.walletCount}</span></div>
                <div><span className="text-gray-500">Turnkey Org:</span> <span className="text-gray-200 font-mono text-xs">{key.mpcOrg.turnkeyOrgId.slice(0, 16)}...</span></div>
              </div>
            ) : (
              <MpcConfigForm apiKeyId={key.id} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
