import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { CreditCard, Zap, Check } from 'lucide-react';

export default async function BillingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const plans = [
    {
      name: 'Starter',
      price: 'Free',
      period: '/month',
      description: 'For early-stage projects',
      features: ['10,000 API requests/month', 'Up to 100 MPC wallets', 'Testnet access', 'Community support'],
      cta: 'Current Plan',
      current: true,
    },
    {
      name: 'Pro',
      price: '$99',
      period: '/month',
      description: 'For growing applications',
      features: ['100,000 API requests/month', 'Up to 1,000 MPC wallets', 'Mainnet + Testnet', 'Priority support', 'Session key delegation'],
      cta: 'Upgrade',
      current: false,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'For high-scale deployments',
      features: ['Unlimited API requests', 'Unlimited MPC wallets', 'Dedicated relayer', 'SLAs', 'Custom SLAs & support', 'Key share export'],
      cta: 'Contact Sales',
      current: false,
    },
  ];

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Billing</h1>
        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400">
          Coming Soon
        </span>
      </div>
      <p className="text-white/60 mb-8">Manage your subscription and view usage</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.name} className={`bg-[#0d0d0d] border rounded-[14px] p-6 ${plan.current ? 'border-emerald-500/20 ring-1 ring-emerald-500/10' : 'border-white/[0.08]'}`}>
            <div className="flex items-center gap-2 mb-1">
              {plan.name === 'Starter' && <Zap size={18} className="text-white/60" />}
              {plan.name === 'Pro' && <CreditCard size={18} className="text-white/60" />}
              {plan.name === 'Enterprise' && <ShieldIcon size={18} className="text-white/60" />}
              <h2 className="text-lg font-semibold">{plan.name}</h2>
            </div>
            <div className="mb-3">
              <span className="text-3xl font-bold">{plan.price}</span>
              {plan.period && <span className="text-white/40 text-sm">{plan.period}</span>}
            </div>
            <p className="text-white/60 text-sm mb-4">{plan.description}</p>

            <ul className="space-y-2 mb-6">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                  <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <button
              className={`w-full py-2.5 rounded-[14px] text-sm font-medium transition-colors ${
                plan.current
                  ? 'bg-white/[0.06] text-white/40 cursor-default'
                  : 'bg-white hover:bg-white/90 text-black'
              }`}
              disabled={plan.current}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-[#0d0d0d] border border-white/[0.08] rounded-[14px] p-6">
        <h2 className="text-lg font-semibold mb-4">Current Usage (Starter)</h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-white/60">API Requests</span>
              <span className="text-white/70">— / 10,000</span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full bg-white/40 rounded-full" style={{ width: '0%' }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-white/60">MPC Wallets</span>
              <span className="text-white/70">— / 100</span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full bg-white/40 rounded-full" style={{ width: '0%' }} />
            </div>
          </div>
        </div>
        <p className="text-xs text-white/25 mt-4">Usage tracking will be enabled when billing goes live.</p>
      </div>
    </div>
  );
}

function ShieldIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
