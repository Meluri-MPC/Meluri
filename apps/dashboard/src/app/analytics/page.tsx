import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

async function getDeveloper() {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  if (!email) return null;
  return prisma.developer.findUnique({ where: { email } });
}

async function getRecentActivity(days: number) {
  const now = Date.now();
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(now - (days - 1 - i) * 86400000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const startDate = new Date(now - days * 86400000);

  const rawTxs = await prisma.mpcTransaction.findMany({
    where: { createdAt: { gte: startDate } },
    select: { createdAt: true, type: true },
  });

  const txBuckets = buckets.map((label, i) => {
    const bucketStart = new Date(now - (days - i) * 86400000);
    const bucketEnd = new Date(now - (days - 1 - i) * 86400000);
    const count = rawTxs.filter((tx) => tx.createdAt >= bucketStart && tx.createdAt < bucketEnd).length;
    return { label, count };
  });

  return txBuckets;
}

export default async function AnalyticsPage() {
  const developer = await getDeveloper();
  if (!developer) redirect('/sign-in');

  const [apiKeys, mpcOrg, wallets, txCount, recentActivity] = await Promise.all([
    prisma.apiKey.count({ where: { developerId: developer.id } }),
    prisma.mpcOrganization.findFirst({
      where: { apiKey: { developerId: developer.id } },
      select: { walletCount: true, txCount: true, appName: true, allowedDomains: true },
    }),
    prisma.mpcWallet.count({ where: { organization: { apiKey: { developerId: developer.id } } } }),
    prisma.mpcTransaction.count({ where: { wallet: { organization: { apiKey: { developerId: developer.id } } } } }),
    getRecentActivity(14),
  ]);

  const maxTx = Math.max(1, ...recentActivity.map((d) => d.count));
  const totalWallets = mpcOrg?.walletCount ?? wallets;
  const totalTxs = mpcOrg?.txCount ?? txCount;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Analytics</h1>
      <p className="text-gray-400 mb-8">Usage metrics for your application</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="API Requests Today" value="—" sub="Metrics collection enabled next sprint" color="text-velumx-400" />
        <StatCard label="Active Wallets" value={String(totalWallets)} sub="Total MPC wallets" color="text-emerald-400" />
        <StatCard label="Transactions" value={String(totalTxs)} sub="All time" color="text-amber-400" />
        <StatCard label="Active API Keys" value={String(apiKeys)} sub="Your keys" color="text-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Transactions (Last 14 Days)</h2>
          {recentActivity.every((d) => d.count === 0) ? (
            <p className="text-gray-500 text-center py-12">No transaction data yet. Start sending transactions to see activity here.</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {recentActivity.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500">{d.count || ''}</span>
                  <div
                    className="w-full rounded-t bg-velumx-500/60 hover:bg-velumx-400 transition-colors"
                    style={{ height: `${(d.count / maxTx) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }}
                    title={`${d.label}: ${d.count} txs`}
                  />
                  <span className="text-[10px] text-gray-600 rotate-45 origin-left whitespace-nowrap">{d.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">API Usage</h2>
          <p className="text-gray-500 text-center py-12">
            API request tracking is scheduled for the next release.
            <br />
            <span className="text-sm">Requests/day, error rates, and latency percentiles will appear here.</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Auth Methods</h2>
          <div className="space-y-3">
            <MetricBar label="Wallet (MPC)" value={totalWallets} max={Math.max(1, totalWallets)} color="bg-velumx-500" />
            <MetricBar label="External Wallets" value={0} max={Math.max(1, totalWallets)} color="bg-purple-500" />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Network Split</h2>
          <div className="space-y-3">
            <MetricBar label="Mainnet" value={0} max={1} color="bg-emerald-500" />
            <MetricBar label="Testnet" value={totalWallets} max={Math.max(1, totalWallets)} color="bg-amber-500" />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">App Info</h2>
          <div className="space-y-2 text-sm">
            <p className="text-gray-400">Name: <span className="text-gray-200">{mpcOrg?.appName ?? 'Not configured'}</span></p>
            <p className="text-gray-400">Domains:</p>
            {mpcOrg?.allowedDomains?.length ? (
              <ul className="list-disc list-inside text-gray-300">
                {(mpcOrg.allowedDomains as string[]).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No domains configured</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-sm text-gray-400 mb-2">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

function MetricBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300">{value}</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
