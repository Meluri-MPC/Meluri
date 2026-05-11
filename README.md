# Meluri MPC

Stacks-native embedded wallet infrastructure — **like Privy for Stacks**.

> Social login → MPC wallet → gasless transactions. All on Stacks.

## Demo

Test the custodial wallet live: **https://meluri-demo.netlify.app** (or local: `pnpm demo:dev` → `http://localhost:5173`)

1. Enter any email or username
2. Wallet created instantly (server-side Stacks key generation)
3. Send STX and SIP-010 tokens — **zero gas** (sponsored by VelumX)

## Architecture

```
┌──────────────────────────────────────────────────┐
│                    SDK (@meluri/mpc)              │
│  React hooks · Core API · Auth modal · Iframe     │
└──────────────────────┬───────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────┐
│                 API (NestJS)                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Auth   │  │  Wallet  │  │  Relayer Service  │ │
│  │ Service │  │ Service  │  │  (VelumX SDK)     │ │
│  └─────────┘  └──────────┘  └──────────────────┘ │
│        │            │               │             │
└────────┼────────────┼───────────────┼─────────────┘
         │            │               │
         ▼            ▼               ▼
┌──────────┐  ┌────────────┐  ┌──────────────┐
│  Clerk   │  │ PostgreSQL │  │   VelumX     │
│  (auth)  │  │  (Neon)    │  │  (gas relayer)│
└──────────┘  └────────────┘  └──────────────┘
```

## How VelumX Sponsors Transactions

Meluri uses [VelumX](https://velumx.xyz) — a Relayer-as-a-Service — to sponsor all transaction gas fees. Users never need STX to send tokens.

```
1. Meluri builds unsigned sponsored tx  (sponsored: true)
2. Meluri signs origin                  (TransactionSigner.signOrigin)
3. → VelumX co-signs sponsor           (velumx.sponsor)
4. → VelumX broadcasts to Stacks       (txid returned)
```

**Critical:** Do NOT pass `userId` to `velumx.sponsor()` — it derives a different signing key from the end-user ID, producing a wallet with no funds.

Read the full integration guide: [`docs/velumx-integration.md`](docs/velumx-integration.md)

## Project Structure

```
apps/
├── api/            NestJS backend — auth, wallets, VelumX relayer, Hiro indexing
├── dashboard/      Developer portal — API keys, MPC sub-orgs, analytics
└── demo/           Custodial wallet demo — sign in, balance, send STX/tokens

packages/
└── sdk/            Client SDK — MeluriMPC class, React hooks, Turnkey integration

docs/
├── velumx-integration.md   VelumX relayer setup and debugging
├── implementation-plan.md  Full production roadmap (Auth + MPC + Wallet)
├── design.md               System architecture and data models
└── tasks.md                ~140 tracked tasks across 5 phases
```

## Quick Start

```bash
# Install
pnpm install

# API (needs .env)
pnpm dev

# Dashboard
pnpm dashboard:dev

# Demo
pnpm demo:dev
```

### Environment Variables

**API** (`apps/api/.env`):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection (Neon) |
| `VELUMX_RELAYER_API_KEY` | VelumX project API key |
| `VELUMX_NETWORK` | `testnet` or `mainnet` |
| `HIRO_API_URL` | Stacks API endpoint |

## Deployment

- **API**: [Render](https://render.com) — `pnpm install && pnpm --filter @meluri/api build:prod`
- **Dashboard**: [Vercel](https://vercel.com) — Next.js, root dir `apps/dashboard`
- **Demo**: [Netlify](https://netlify.com) — Vite, auto-detected via `netlify.toml`

## License

MIT
