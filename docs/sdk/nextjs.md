# Next.js Integration

## Pages Router

```tsx
// pages/_app.tsx
import type { AppProps } from 'next/app';
import { WalletProvider } from '@velumx/mpc/react';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WalletProvider>
      <Component {...pageProps} />
    </WalletProvider>
  );
}
```

```tsx
// pages/index.tsx
import { useEffect, useState } from 'react';
import { VelumxMPC } from '@velumx/mpc';
import { WalletButton, useBalance } from '@velumx/mpc/react';

const velumx = new VelumxMPC({
  apiKey: process.env.NEXT_PUBLIC_VELUMX_API_KEY!,
  auth: {
    async getSession() { /* your auth */ },
    async login() { /* your auth */ },
    async logout() { /* your auth */ },
  },
  network: 'testnet',
});

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const { data: balance } = useBalance({ address: address || undefined });

  return (
    <div>
      <WalletButton
        onConnect={(addr) => setAddress(addr)}
        onDisconnect={() => setAddress(null)}
      />
      {address && <p>Balance: {balance?.stx} STX</p>}
    </div>
  );
}
```

## App Router (React Server Components)

### Client Component Wrapper

```tsx
// components/VelumXProvider.tsx
'use client';

import { WalletProvider } from '@velumx/mpc/react';

export function VelumXProvider({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
```

### Layout

```tsx
// app/layout.tsx
import { VelumXProvider } from '@/components/VelumXProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <VelumXProvider>{children}</VelumXProvider>
      </body>
    </html>
  );
}
```

### Page with Client Components

```tsx
// app/page.tsx
import { WalletSection } from './WalletSection';
import { ServerData } from './ServerData';

export default async function Home() {
  // Server-side data fetching
  const serverData = await fetchServerData();

  return (
    <main>
      <h1>VelumX + Next.js App Router</h1>
      <ServerData data={serverData} />
      <WalletSection />
    </main>
  );
}
```

```tsx
// app/WalletSection.tsx
'use client';

import { useState } from 'react';
import { WalletButton, useBalance, useWallet } from '@velumx/mpc/react';

export function WalletSection() {
  const { wallet } = useWallet();
  const { data: balance } = useBalance({ address: wallet.address || undefined });

  return (
    <div>
      <WalletButton />
      {wallet.connected && (
        <div>
          <p>Address: {wallet.address}</p>
          <p>Balance: {balance?.stx} STX</p>
        </div>
      )}
    </div>
  );
}
```

### Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_VELUMX_API_KEY=vx_sk_your_api_key
```

## Server-Side Utilities

Use the raw SDK client in API routes or Server Actions:

```tsx
// app/api/wallet/route.ts
import { NextResponse } from 'next/server';
import { VelumxMPC } from '@velumx/mpc';

export async function GET(request: Request) {
  const velumx = new VelumxMPC({
    apiKey: process.env.VELUMX_API_KEY!,
    auth: {
      async getSession() {
        // Server-side session from cookies
        const session = await getServerSession();
        return session ? { userId: session.userId, sessionToken: session.token } : null;
      },
      async login() { throw new Error('Login must happen client-side'); },
      async logout() { throw new Error('Logout must happen client-side'); },
    },
  });

  const wallet = await velumx.getWallet();
  const balance = await velumx.getBalance();

  return NextResponse.json({ address: wallet.stxAddress, balance });
}
```
