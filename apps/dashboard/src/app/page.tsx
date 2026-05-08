import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Wallet2, Key, Activity, Users } from 'lucide-react';

async function getOrCreateDeveloper() {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  if (!email) return null;

  return prisma.developer.upsert({
    where: { email },
    update: { name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(), avatarUrl: user?.imageUrl },
    create: { email, name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(), avatarUrl: user?.imageUrl },
  });
}

export default async function OverviewPage() {
  const developer = await getOrCreateDeveloper();
  if (!developer) redirect('/sign-in');

  const [apiKeyCount, mpcOrg, wallets, transactions] = await Promise.all([
    prisma.apiKey.count({ where: { developerId: developer.id, status: 'Active' } }),
    prisma.mpcOrganization.findFirst({
      where: { apiKey: { developerId: developer.id } },
      select: { walletCount: true, txCount: true, appName: true },
    }),
    prisma.mpcWallet.count({
      where: { organization: { apiKey: { developerId: developer.id } } },
    }),
    prisma.mpcTransaction.count({
      where: { wallet: { organization: { apiKey: { developerId: developer.id } } } },
    }),
  ]);

  const stats = [
    { label: 'Active API Keys', value: apiKeyCount, icon: Key, color: 'text-meluri-400' },
    { label: 'MPC Wallets', value: mpcOrg?.walletCount ?? wallets, icon: Wallet2, color: 'text-emerald-400' },
    { label: 'Transactions', value: mpcOrg?.txCount ?? transactions, icon: Activity, color: 'text-amber-400' },
    { label: 'App Name', value: mpcOrg?.appName ?? 'Not configured', icon: Users, color: 'text-purple-400', isString: true },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Overview</h1>
      <p className="text-gray-400 mb-8">Welcome back, {developer.name || 'Developer'}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg bg-gray-800 ${s.color}`}>
                <s.icon size={20} />
              </div>
              <span className="text-sm text-gray-400">{s.label}</span>
            </div>
            <p className={`text-2xl font-bold ${s.isString ? 'text-base' : ''}`}>
              {s.isString ? s.value : s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Start</h2>
        <div className="bg-gray-950 rounded-lg p-4 font-mono text-sm text-gray-300">
          <p className="text-gray-500">// 1. Install the SDK</p>
          <p className="text-meluri-400">npm install @meluri/mpc</p>
          <br />
          <p className="text-gray-500">// 2. Initialize</p>
          <p>
            <span className="text-purple-400">import</span>{' '}
            <span className="text-meluri-400">{'{ MeluriMPC }'}</span>{' '}
            <span className="text-purple-400">from</span>{' '}
            <span className="text-emerald-400">&apos;@meluri/mpc&apos;</span>;
          </p>
          <br />
          <p>
            <span className="text-purple-400">const</span>{' '}
            <span className="text-amber-400">meluri</span> ={' '}
            <span className="text-purple-400">new</span>{' '}
            <span className="text-meluri-400">MeluriMPC</span>
            ({'{ apiKey: '}<span className="text-emerald-400">&apos;ml_...&apos;</span>{' }'});
          </p>
          <br />
          <p className="text-gray-500">// 3. Authenticate users</p>
          <p>
            <span className="text-purple-400">await</span>{' '}
            <span className="text-amber-400">meluri</span>.login();
          </p>
          <br />
          <p className="text-gray-500">// 4. Get wallet & send</p>
          <p>
            <span className="text-purple-400">const</span> wallet ={' '}
            <span className="text-purple-400">await</span>{' '}
            <span className="text-amber-400">meluri</span>.getWallet();
          </p>
          <p>
            <span className="text-purple-400">await</span>{' '}
            <span className="text-amber-400">meluri</span>.sendSTX(
            {'{ recipient: '}<span className="text-emerald-400">&apos;SP...&apos;</span>
            {', amount: 1000000 }'});
          </p>
        </div>
      </div>
    </div>
  );
}
