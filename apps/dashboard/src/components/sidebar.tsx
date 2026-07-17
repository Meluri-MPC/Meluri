'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton, useUser } from '@clerk/nextjs';
import { LayoutDashboard, Key, Wallet, Shield, BookOpen, BarChart3, Users, CreditCard, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/api-keys', label: 'API Keys', icon: Key },
  { href: '/mpc', label: 'MPC Config', icon: Shield },
  { href: '/wallets', label: 'Wallets', icon: Wallet },
  { href: '/docs', label: 'SDK Docs', icon: BookOpen },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/billing', label: 'Billing', icon: CreditCard },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) return null;

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-[#0d0d0d] border-r border-white/[0.08] flex flex-col">
      <div className="p-6 border-b border-white/[0.08]">
        <h1 className="text-xl font-bold text-white tracking-tight">VelumX MPC</h1>
        <p className="text-[10px] uppercase tracking-widest text-white/25 mt-1">Developer Console</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-sm transition-colors',
              pathname === href
                ? 'bg-white/[0.06] text-white'
                : 'text-white/60 hover:text-white hover:bg-white/[0.04]',
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-white/[0.08]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-sm font-medium text-black">
            {user?.firstName?.[0] ?? 'D'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-white">{user?.fullName ?? 'Developer'}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/25 truncate">{user?.emailAddresses?.[0]?.emailAddress}</p>
          </div>
        </div>
        <SignOutButton>
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white/40 hover:text-rose-400 hover:bg-white/[0.04] rounded-[14px] transition-colors">
            <LogOut size={16} />
            Sign out
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
