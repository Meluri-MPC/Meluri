'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton, useUser } from '@clerk/nextjs';
import { LayoutDashboard, Key, Wallet, Shield, BookOpen, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/api-keys', label: 'API Keys', icon: Key },
  { href: '/mpc', label: 'MPC Config', icon: Shield },
  { href: '/wallets', label: 'Wallets', icon: Wallet },
  { href: '/docs', label: 'SDK Docs', icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) return null;

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold text-meluri-400">Meluri MPC</h1>
        <p className="text-xs text-gray-500 mt-1">Developer Console</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              pathname === href
                ? 'bg-meluri-600/20 text-meluri-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-meluri-600 flex items-center justify-center text-sm font-medium">
            {user?.firstName?.[0] ?? 'D'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.fullName ?? 'Developer'}</p>
            <p className="text-xs text-gray-500 truncate">{user?.emailAddresses?.[0]?.emailAddress}</p>
          </div>
        </div>
        <SignOutButton>
          <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors">
            <LogOut size={16} />
            Sign out
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
