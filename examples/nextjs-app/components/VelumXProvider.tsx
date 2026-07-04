'use client';

import { WalletProvider } from '@velumx/mpc/react';

export function VelumXProvider({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children as any}</WalletProvider>;
}
