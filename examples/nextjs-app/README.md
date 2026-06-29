# VelumX MPC + Next.js App Router

Next.js 14+ App Router with React Server Components + VelumX client components.

## Quick Start

```bash
cd examples/nextjs-app
cp .env.example .env.local
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

```
app/
  layout.tsx  — Root layout with VelumXProvider
  page.tsx    — RSC page with client wallet section
components/
  VelumXProvider.tsx  — 'use client' wallet context wrapper
  WalletSection.tsx   — 'use client' login + wallet UI
  ServerInfo.tsx      — Server component (RSC)
```

## Architecture

- Server Components for static/marketing content
- Client Components (`'use client'`) for interactive wallet features
- `WalletProvider` wraps only client components to avoid hydration issues
