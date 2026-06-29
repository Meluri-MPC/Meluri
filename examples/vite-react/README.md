# VelumX MPC + Vite + React

Minimal Vite + React app using VelumX MPC SDK.

## Quick Start

```bash
cd examples/vite-react
cp .env.example .env
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Environment Variables

Create `.env`:

```bash
VITE_VELUMX_API_KEY=vx_sk_your_api_key
```

## Features

- Login with MPC wallet creation
- STX balance display
- Send STX form
- Transaction history
- All React hooks: `useBalance`, `useTransactions`, `useSendTransaction`
