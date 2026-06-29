# VelumX MPC + Next.js Pages Router

Full example using VelumX MPC SDK with Next.js Pages Router.

## Quick Start

```bash
cd examples/nextjs-pages
cp .env.example .env.local
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_VELUMX_API_KEY=vx_sk_your_api_key
```

## Structure

```
pages/
  _app.tsx    — WalletProvider wrapper
  index.tsx   — Main page with login + wallet info
```

## Features

- MPC wallet creation (demo auth)
- Balance display via `useBalance` hook
- Transaction history via `useTransactions` hook
- Session persistence via localStorage
