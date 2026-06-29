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
    { label: 'Active API Keys', value: apiKeyCount, icon: Key, color: 'text-velumx-400' },
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
        <QuickStartWizard />
      </div>
    </div>
  );
}

function QuickStartWizard() {
  return (
    <div className="space-y-4">
      <Step
        number={1}
        title="Create an API Key"
        description="Generate an API key for your SDK integration."
        action={{ label: 'Manage API Keys', href: '/api-keys' }}
      />
      <Step
        number={2}
        title="Configure MPC"
        description="Provision your Turnkey MPC infrastructure for embedded wallets."
        action={{ label: 'MPC Configuration', href: '/mpc' }}
      />
      <Step
        number={3}
        title="Install & Integrate"
        description="Add the SDK to your app and start using VelumX MPC."
        action={null}
        code={`npm install @velumx/mpc\n\nimport { VelumxMPC } from '@velumx/mpc';\n\nconst velumx = new VelumxMPC({\n  apiKey: 'your_api_key_here',\n  auth: myAuthProvider,\n});\n\nawait velumx.login();`}
      />
    </div>
  );
}

function Step({ number, title, description, action, code }: {
  number: number;
  title: string;
  description: string;
  action: { label: string; href: string } | null;
  code?: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-velumx-600 flex items-center justify-center text-sm font-bold shrink-0">
          {number}
        </div>
        <div className="w-px flex-1 bg-gray-800 mt-2" />
      </div>
      <div className="flex-1 pb-6">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-gray-400 mt-0.5">{description}</p>
        {action && (
          <a
            href={action.href}
            className="inline-block mt-2 text-sm text-velumx-400 hover:text-velumx-300 transition-colors"
          >
            {action.label} &rarr;
          </a>
        )}
        {code && (
          <div className="bg-gray-950 rounded-lg p-4 mt-2 font-mono text-xs text-gray-300 whitespace-pre overflow-x-auto">
            {code}
          </div>
        )}
      </div>
    </div>
  );
}
