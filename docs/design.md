# Meluri MPC — System Design Document

> **Status:** Draft v1.0  
> **Last Updated:** 2026-05-09  
> **Description:** Stacks-native embedded wallet infrastructure (like Privy/Web3Auth for Stacks)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Component Design](#3-component-design)
   - [3a. Auth Service](#3a-auth-service)
   - [3b. MPC Service](#3b-mpc-service)
   - [3c. Wallet Orchestrator](#3c-wallet-orchestrator)
   - [3d. SDK Design](#3d-sdk-design)
4. [Data Models](#4-data-models)
5. [API Design](#5-api-design)
6. [Security Model](#6-security-model)
7. [Deployment Architecture](#7-deployment-architecture)

---

## 1. System Overview

### 1.1 What Meluri MPC Is

Meluri MPC is an **embedded wallet infrastructure** for the Stacks blockchain ecosystem. It enables developers to integrate non-custodial, MPC-based wallets directly into their web applications with a few lines of code — analogous to what Privy and Web3Auth provide for Ethereum and Solana ecosystems, but purpose-built for Stacks.

### 1.2 The Problem

Stacks applications face three critical wallet UX challenges:

| Problem | Impact |
|---------|--------|
| **Wallet fragmentation** — users must install Leather/Xverse/Hiro browser extensions | 80-95% user drop-off before first transaction |
| **Key management burden** — developers handling private keys risk catastrophic security failures | Legal liability, reputation damage, regulatory exposure |
| **No session-key abstraction** — every transaction requires full wallet approval | Unusable for games, social apps, high-frequency dApps |

### 1.3 Key Features

- **Embedded MPC wallets** — wallets created via a 3-share MPC protocol (1 client share, 2 server shares); no single party ever holds the full key
- **Session keys with delegation** — scoped, time-limited session keys signed by the MPC quorum, enabling gasless/sponsored UX for frequent txs
- **Multi-tenant developer isolation** — each developer gets an isolated MPC organization, API key hierarchy, and domain restrictions
- **Stacks-native operations** — STX transfers, SIP-010 fungible tokens, SIP-009 NFTs, Clarity contract calls, post-condition construction
- **Sponsored transactions** — integrated relay service via VelumX (or configurable relay providers)
- **Hiro API indexing** — on-chain balance and transaction syncing with PostgreSQL persistence
- **OAuth-based authentication** — developer brings their own auth (Clerk, Auth0, Firebase, etc.); Meluri pairs user identity to wallet
- **Developer dashboard** — API key management, MPC provisioning, wallet analytics, usage metrics

### 1.4 Non-Goals (v1)

- Full Stacks subaccount derivation (single-account wallets initially)
- Bitcoin native operations (Stacks layer only)
- On-device biometric MPC (client share is a browser Turnkey iFrame — hardware TPM in future)

---

## 2. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                     END-USER BROWSER                                  │
│                                                                                      │
│  ┌──────────────────────────────────────┐    ┌─────────────────────────────────────┐ │
│  │         Developer dApp               │    │     Meluri MPC Browser SDK          │ │
│  │                                      │    │                                     │ │
│  │  import { MeluriMPC } from           │    │  ┌───────────────────────────────┐  │ │
│  │    '@meluri/mpc';                    │    │  │   iframe Auth Modal            │  │ │
│  │                                      │    │  │   (Turnkey Stamper)            │  │ │
│  │  const meluri = new MeluriMPC({      │    │  │   - OAuth provider selection    │  │ │
│  │    apiKey: 'ml_...',                 │    │  │   - Email/passkey input         │  │ │
│  │    auth: new MpcAuth({               │    │  │   - Session delegation consent  │  │ │
│  │      clerkKey: 'pk_...'              │    │  └───────────────────────────────┘  │ │
│  │    })                                │    │                                     │ │
│  │  });                                 │    │  ┌───────────────────────────────┐  │ │
│  │                                      │    │  │   React Hooks Layer           │  │ │
│  │  meluri.login();                     │    │  │   useMeluriWallet()            │  │ │
│  │  meluri.sendSTX({...});              │    │  │   useMeluriSession()           │  │ │
│  │  meluri.getBalance();                │    │  │   useMeluriTransactions()      │  │ │
│  │                                      │    │  └───────────────────────────────┘  │ │
│  └──────────────────────────────────────┘    │                                     │ │
│                                              │  ┌───────────────────────────────┐  │ │
│                                              │  │   Core SDK                    │  │ │
│                                              │  │   MpcTurnkey | MpcSigning     │  │ │
│                                              │  │   MpcSession | MpcWalletApi   │  │ │
│                                              │  └───────────────────────────────┘  │ │
│                                              └─────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────┘
          │                           │                           │
          │ HTTPS (REST)              │ HTTPS (REST)              │ WebSocket (WSS)
          ▼                           ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                    MELURI MPC BACKEND                                 │
│                                                                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────────────────┐ │
│  │    Auth Service      │  │    MPC Service       │  │   Wallet Orchestrator        │ │
│  │    (NestJS)          │  │    (NestJS + WS)     │  │   (NestJS)                   │ │
│  │                     │  │                     │  │                              │ │
│  │  POST /auth/register│  │  WS /mpc            │  │  POST /wallets               │ │
│  │  POST /auth/api-keys│  │  - DKG ceremony     │  │  GET  /wallets/:addr         │ │
│  │  GET  /auth/api-keys│  │  - Sign ceremony    │  │  GET  /wallets/:addr/assets  │ │
│  │  DEL  /auth/api-keys│  │  - Key refresh      │  │  GET  /wallets/:addr/txs     │ │
│  │  POST /auth/mpc/    │  │  - Share state      │  │  POST /tx/send               │ │
│  │       provision     │  │    machine          │  │  POST /tx/call-contract      │ │
│  │                     │  │                     │  │                              │ │
│  │  ┌───────────────┐  │  │  ┌───────────────┐  │  │  ┌────────────────────────┐  │ │
│  │  │ JWT issuance  │  │  │  │ TSS Protocol  │  │  │  │ Transaction Builder    │  │ │
│  │  │ OAuth handler │  │  │  │ GG20 / CGGMP  │  │  │  │ (STX, SIP-010, SIP-009)│  │ │
│  │  │ Session mgmt  │  │  │  │ Key shares    │  │  │  │ Post-condition engine  │  │ │
│  │  │ Tenant isol.  │  │  │  │ Sign state    │  │  │  └────────────────────────┘  │ │
│  │  └───────────────┘  │  │  └───────────────┘  │  │                              │ │
│  └─────────┬───────────┘  └─────────┬───────────┘  └──────────────┬───────────────┘ │
│            │                        │                             │                  │
│            ▼                        ▼                             ▼                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│  │                            Relayer Service                                       │ │
│  │                                                                                  │ │
│  │  • Broadcasts signed transactions to Stacks nodes                                │ │
│  │  • Sponsors gas fees (VelumX or custom relayer)                                  │ │
│  │  • Fee estimation engine                                                         │ │
│  │  • Nonce management per wallet                                                   │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│  ┌───────────────────────────┐    ┌───────────────────────────────────────────────┐ │
│  │     PostgreSQL 16         │    │     Redis 7                                    │ │
│  │                          │    │                                                │ │
│  │  Developer, ApiKey       │    │  Session tokens (blacklist/whitelist)          │ │
│  │  MpcOrganization         │    │  Rate-limit counters                           │ │
│  │  MpcWallet, MpcKeyShare  │    │  MPC ceremony ephemeral state                  │ │
│  │  MpcSignature             │    │  WebSocket pub/sub channels                   │ │
│  │  MpcBalance              │    │  Transaction nonce cache                       │ │
│  │  MpcTransaction          │    │  OAuth state tokens                            │ │
│  │  SimpleWallet            │    │                                                │ │
│  │  ExternalWallet          │    │                                                │ │
│  └───────────────────────────┘    └───────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────┘
          │                           │                           │
          ▼                           ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                 EXTERNAL PROVIDERS                                     │
│                                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ OAuth        │  │ Hiro API     │  │ VelumX       │  │ Stacks Nodes             │ │
│  │ (Clerk,      │  │              │  │ Relayer      │  │                          │ │
│  │  Auth0,      │  │ • Balances   │  │              │  │ • Transaction broadcast  │ │
│  │  Firebase)   │  │ • Txn history│  │ • Sponsorship│  │ • Block monitoring       │ │
│  │              │  │ • FT/NFT     │  │ • Fee est.   │  │ • Mempool                │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Data Flow Summary

| Flow | Path |
|------|------|
| **User Login** | Browser SDK → OAuth Provider → Auth Service (JWT issue) → SDK session store |
| **Wallet Creation** | SDK → Auth Service (GET org) → Turnkey API (create wallet) → API (register wallet in DB) |
| **Transaction Signing** | SDK builds unsigned tx → session key signs OR Turnkey signs → API → Relayer → Stacks Node |
| **Balance Query** | SDK → API (GET assets) → Indexing Service → Hiro API → DB cache → Response |
| **MPC DKG** | SDK WebSocket → MPC Service → Share:1 to client, Share:2 to server S1, Share:3 to server S2 |

---

## 3. Component Design

### 3a. Auth Service

The Auth Service is the entry point for all developer and end-user authentication. It manages developer identity, API key lifecycle, MPC organization provisioning, and end-user session tokens.

#### 3a.1 Database Schema (Prisma)

```prisma
model Developer {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  apiKeys          ApiKey[]
  developerDomains DeveloperDomain[]
  refreshTokens    RefreshToken[]
  sessions         Session[]
}

model ApiKey {
  id          String   @id @default(cuid())
  developerId String
  developer   Developer @relation(fields: [developerId], references: [id])
  name        String
  keyHash     String   @unique
  keyPrefix   String
  status      String   @default("Active")   // Active | Revoked | Expired
  permissions String[] @default(["read", "write", "mpc"])
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  createdAt   DateTime @default(now())

  mpcOrg          MpcOrganization?
  developerDomain DeveloperDomain?

  @@index([developerId])
  @@index([keyHash])
}

model DeveloperDomain {
  id          String   @id @default(cuid())
  developerId String
  developer   Developer @relation(fields: [developerId], references: [id])
  domain      String   @unique   // e.g., "app.example.com"
  verified    Boolean  @default(false)
  apiKeys     ApiKey[]
  createdAt   DateTime @default(now())

  @@index([developerId])
}

model Session {
  id           String   @id @default(cuid())
  developerId  String
  developer    Developer @relation(fields: [developerId], references: [id])
  userId       String              // end-user ID from developer's auth system
  token        String   @unique    // JWT
  refreshToken String?  @unique
  expiresAt    DateTime
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())
  revokedAt    DateTime?

  @@index([developerId])
  @@index([token])
  @@index([userId])
}

model RefreshToken {
  id          String   @id @default(cuid())
  developerId String
  developer   Developer @relation(fields: [developerId], references: [id])
  token       String   @unique
  sessionId   String
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  usedAt      DateTime?
  revokedAt   DateTime?

  @@index([token])
}
```

#### 3a.2 REST API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/register` | None | Register developer account |
| `POST` | `/api/v1/auth/api-keys` | API Key | Create new API key (max 5 active) |
| `GET` | `/api/v1/auth/api-keys` | API Key | List all API keys for developer |
| `DELETE` | `/api/v1/auth/api-keys/:id` | API Key | Revoke an API key |
| `POST` | `/api/v1/auth/mpc/provision` | API Key | Provision MPC organization |
| `POST` | `/api/v1/auth/domains` | API Key | Add allowed domain |
| `GET` | `/api/v1/auth/domains` | API Key | List verified domains |
| `POST` | `/api/v1/auth/session` | None | Create end-user session (returns JWT) |
| `POST` | `/api/v1/auth/session/refresh` | JWT | Refresh an expiring session |
| `DELETE` | `/api/v1/auth/session` | JWT | Revoke a session |
| `GET` | `/api/v1/auth/me` | JWT | Get current session metadata |

#### 3a.3 OAuth Flow

```
End-User Browser              Developer dApp             Meluri Auth Service         OAuth Provider
     │                             │                            │                        │
     │  1. Click "Login"           │                            │                        │
     │ ──────────────────────────> │                            │                        │
     │                             │  2. MpcAuth.login()        │                        │
     │                             │ ──────────────────────────>│                        │
     │                             │                            │ 3. Redirect to OAuth   │
     │ <────────────────────────────────────────────────────────────────────────────────│
     │  4. User authenticates with Google/Email/etc.                                      │
     │ ─────────────────────────────────────────────────────────────────────────────────>│
     │                             │                            │ 5. OAuth callback      │
     │                             │                            │<────────────────────────│
     │                             │                            │                        │
     │                             │  6. JWT (HS256)            │                        │
     │                             │<───────────────────────────│                        │
     │                             │                            │                        │
     │  7. SDK stores JWT          │                            │                        │
     │     in localStorage         │                            │                        │
```

#### 3a.4 JWT Structure

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user_clx7k9abc0000001",         // end-user ID
    "iss": "meluri-mpc",                     // issuer
    "aud": ["meluri-api", "meluri-mpc-ws"],  // audience
    "dev": "dev_clx7k2def0000002",           // developer ID
    "org": "org_clx7k3ghi0000003",           // MPC org ID
    "wallet": "SP2J...xyz",                  // Stacks address
    "scope": "wallet:read wallet:sign",
    "iat": 1715299200,
    "exp": 1715306400,                       // 2-hour expiry
    "jti": "jti_clx7k4jkl0000004"           // unique token ID
  },
  "signature": "HMAC-SHA256(header.payload, MELURI_JWT_SECRET)"
}
```

#### 3a.5 Session Management

- **Session state** stored in PostgreSQL `Session` table
- **Refresh tokens** are opaque 256-bit random strings, hashed with SHA-256 before storage
- **Revocation** via `DELETE /auth/session` blacklists the JWT `jti` in Redis with TTL = remaining expiry time
- **Max sessions per user**: 10 (configurable per developer)
- **Idle timeout**: sessions without activity for 30 minutes are eligible for silent refresh or expiration

#### 3a.6 Developer Tenant Isolation

Each API key maps to exactly one `MpcOrganization`. All downstream requests are scoped by:

```typescript
// api-key.guard.ts (simplified)
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest();
  const rawKey = request.headers['x-api-key'];

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const apiKey = await this.prisma.apiKey.findUnique({
    where: { keyHash },
    include: { mpcOrg: true, developerDomain: true },
  });

  if (!apiKey || apiKey.status !== 'Active') {
    await this.constantTimeDelay();
    throw new UnauthorizedException('Invalid API key');
  }

  // Domain verification (Origin header check)
  const origin = request.headers['origin'];
  if (apiKey.developerDomain && origin) {
    const originHostname = new URL(origin).hostname;
    if (!originHostname.endsWith(apiKey.developerDomain.domain)) {
      throw new UnauthorizedException('Invalid origin domain');
    }
  }

  request.apiKey = apiKey;
  return true;
}
```

---

### 3b. MPC Service

The MPC Service implements Threshold Signature Scheme (TSS) protocols for distributed key generation and signing. It runs as a WebSocket server that coordinates multi-party computation between the client browser and server-side share holders.

#### 3b.1 TSS Protocol Choice

| Protocol | Rounds (DKG) | Rounds (Sign) | Curve Support | Maturity |
|----------|:---:|:---:|---------------|----------|
| **GG20** | 4 | 4 | secp256k1 | Production (Binance, Fireblocks) |
| CGGMP20 | 3 | 2 | secp256k1 | Emerging |
| FROST | 2 | 2 | secp256k1 (needs ed25519 wrapper) | Zcash, RoasT |

**Chosen: GG20 (via multi-party-ecdsa library)**, with migration path to CGGMP20 for latency reduction in v2.

#### 3b.2 Key Share Structure

```
                      ┌──────────────────┐
                      │   Full Key (k)    │   <- never materializes
                      │  k = s₁ + s₂ + s₃ │      at any single location
                      └────────┬─────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │ Share 1 (s₁) │     │ Share 2 (s₂) │     │ Share 3 (s₃) │
   │             │     │             │     │             │
   │ Client      │     │ Server S1   │     │ Server S2   │
   │ (Browser)   │     │ (pod-1)     │     │ (pod-2)     │
   │             │     │             │     │             │
   │ Encrypted   │     │ Encrypted   │     │ Encrypted   │
   │ with user   │     │ at rest     │     │ at rest     │
   │ passkey     │     │ (AES-256-   │     │ (AES-256-   │
   │             │     │  GCM + KMS) │     │  GCM + KMS) │
   └─────────────┘     └─────────────┘     └─────────────┘

   Threshold: t = 2 of 3
   Signing quorum: Client share + any 1 server share = 2 of 3
```

**Rationale for 2-of-3:**
- Client is always required (non-custodial guarantee)
- Either server can participate (high availability — one server offline doesn't block signing)
- No single server can collude to sign without the client

#### 3b.3 DKG (Distributed Key Generation) Flow

```
Browser (Client)              MPC Service (Coordinator)           Server S1              Server S2
     │                              │                               │                      │
     │  1. WS Connect               │                               │                      │
     │─────────────────────────────>│                               │                      │
     │                              │  2. Init DKG session           │                      │
     │                              │     (redis: dkg:<sessionId>)  │                      │
     │                              │                               │                      │
     │  3. DKG_START { sessionId }  │                               │                      │
     │<─────────────────────────────│                               │                      │
     │                              │                               │                      │
     │  4. ROUND_1 {                │  5. Forward ROUND_1 to S1,S2  │                      │
     │    commitment,               │──────────────────────────────>│                      │
     │    paillier_pk,              │─────────────────────────────────────────────────────>│
     │    zk_proofs                 │                               │                      │
     │  }                          │                               │                      │
     │─────────────────────────────>│                               │                      │
     │                              │  6. ROUND_1 from S1           │                      │
     │                              │<──────────────────────────────│                      │
     │  7. Collect all R1           │  7b. ROUND_1 from S2          │                      │
     │<─────────────────────────────│<─────────────────────────────────────────────────────│
     │                              │                               │                      │
     │                              │  Rounds 2-4 repeat            │                      │
     │                              │  (share computation,          │                      │
     │                              │   zk-verification,            │                      │
     │                              │   finalization)               │                      │
     │                              │                               │                      │
     │  8. DKG_COMPLETE {           │                               │                      │
     │    share_encrypted,          │                               │                      │
     │    public_key,               │                               │                      │
     │    address                   │                               │                      │
     │  }                          │                              │                      │
     │<─────────────────────────────│                               │                      │
```

#### 3b.4 Signing Ceremony Sequence Diagram

```
Browser (Client)          MPC WS Gateway         Server S1              Server S2
     │                         │                     │                      │
     │ 1. SIGN_REQUEST         │                     │                      │
     │   { walletId,           │                     │                      │
     │     messageHash,        │                     │                      │
     │     chainId }           │                     │                      │
     │────────────────────────>│                     │                      │
     │                         │ 2. Lock wallet       │                      │
     │                         │    (Redis: lock:<id>)│                      │
     │                         │                     │                      │
     │                         │ 3. SIGN_START        │                      │
     │                         │────────────────────>│                      │
     │                         │─────────────────────────────────────────────>│
     │                         │                     │                      │
     │ 4. SIGN_ROUND_1         │ 5. Round 1 from S1  │                      │
     │   { r1_commit,          │<────────────────────│                      │
     │     ephemeral_pk,       │ 5b. Round 1 from S2 │                      │
     │     zk_proof }          │<────────────────────────────────────────────│
     │<────────────────────────│                     │                      │
     │                         │                     │                      │
     │ 6. Forward to servers   │                     │                      │
     │────────────────────────>│ 7. Forward R1       │                      │
     │                         │────────────────────>│                      │
     │                         │─────────────────────────────────────────────>│
     │                         │                     │                      │
     │                         │                     │ 8. SIGN_ROUND_2       │
     │ 9. SIGN_ROUND_2 from    │<────────────────────│                      │
     │    servers combined     │<────────────────────────────────────────────│
     │<────────────────────────│                     │                      │
     │                         │                     │                      │
     │ 10. SIGN_ROUND_3        │ 11. Forward         │                      │
     │    { partial_sig,       │────────────────────>│                      │
     │      zk_proof }         │─────────────────────────────────────────────>│
     │────────────────────────>│                     │                      │
     │                         │                     │                      │
     │                         │ 12. Combine shares   │                      │
     │                         │     (t-of-n reconstruct)│                   │
     │                         │                     │                      │
     │ 13. SIGN_COMPLETE {     │                     │                      │
     │    r, s, v,             │                     │                      │
     │    recovery_id          │                     │                      │
     │  }                      │                     │                      │
     │<────────────────────────│                     │                      │
     │                         │ 14. Unlock wallet    │                      │
     │                         │     (Redis: del lock)│                      │
```

**Ceremony invariants:**
- Max 30-second signing timeout (ceremony aborted and wallet unlocked after)
- Nonce derivation: deterministic per wallet via BIP32 `m/44'/5757'/0'/0/<nonce>`
- Concurrency: one signing ceremony per wallet at a time (Redis-based distributed lock)

#### 3b.5 WebSocket Message Protocol

All messages are JSON over WebSocket with a type-envelope pattern:

```typescript
// Message envelope
interface MpcMessage {
  type: MpcMessageType;
  sessionId: string;       // UUID v4
  walletId: string;        // wallet being operated on
  round: number;           // protocol round (1..4 for sign, 1..4 for DKG)
  payload: unknown;        // round-specific data
  timestamp: number;       // Unix ms
  signature: string;       // HMAC of (type|sessionId|round|payload) using session key
}

type MpcMessageType =
  | 'DKG_START'
  | 'DKG_ROUND_1' | 'DKG_ROUND_2' | 'DKG_ROUND_3' | 'DKG_ROUND_4'
  | 'DKG_COMPLETE'
  | 'DKG_ERROR'
  | 'SIGN_START'
  | 'SIGN_ROUND_1' | 'SIGN_ROUND_2' | 'SIGN_ROUND_3'
  | 'SIGN_COMPLETE'
  | 'SIGN_ERROR'
  | 'KEY_REFRESH_START'
  | 'KEY_REFRESH_ROUND_1' | 'KEY_REFRESH_ROUND_2' | 'KEY_REFRESH_ROUND_3'
  | 'KEY_REFRESH_COMPLETE'
  | 'HEARTBEAT'
  | 'ERROR';
```

**Round-specific payloads:**

```typescript
interface DkgRound1Payload {
  commitment: string;       // hex-encoded Pedersen commitment
  paillierPublicKey: string; // Paillier encryption public key
  zkProofs: string[];       // NIZK proofs for well-formedness
}

interface SignRound1Payload {
  ephemeralPublicKey: string;   // k_i * G
  commitment: string;           // hash commitment to R_i
}

interface SignRound3Payload {
  partialSignature: string;     // s_i share
  zkProof: string;              // proof of correct partial sig
}

interface SignCompletePayload {
  r: string;     // signature r value (hex)
  s: string;     // signature s value (hex)
  v: number;     // recovery id
}
```

#### 3b.6 State Machine

```
                    ┌──────────────┐
                    │   IDLE       │
                    └──────┬───────┘
                           │ DKG_START
                           ▼
                    ┌──────────────┐
                    │ DKG_ROUND_1  │──────────────────────────────┐
                    └──────┬───────┘                              │
                           │ all parties submitted R1             │ TIMEOUT (30s)
                           ▼                                      │
                    ┌──────────────┐                              │
               ┌───│ DKG_ROUND_2  │───┐                          │
               │   └──────┬───────┘   │                          │
               │          │ all R2    │ TIMEOUT                  │
               │          ▼           │                          │
               │   ┌──────────────┐   │                          │
               ├───│ DKG_ROUND_3  │───┤                          │
               │   └──────┬───────┘   │                          │
               │          │ all R3    │                          │
               │          ▼           │                          │
               │   ┌──────────────┐   │                          │
               └───│ DKG_ROUND_4  │───┘                          │
                   └──────┬───────┘                              │
                          │ all R4                                │
                          ▼                                       │
                   ┌──────────────┐                               │
                   │   READY      │◄──────────────────────────────┘
                   └──────┬───────┘    (all error paths → IDLE)
                          │ SIGN_START
                          ▼
                   ┌──────────────┐
                   │ SIGN_ROUND_1 │──────────────────────────────┐
                   └──────┬───────┘                              │
                          │ all R1                               │ TIMEOUT (30s)
                          ▼                                      │
                   ┌──────────────┐                              │
              ┌───│ SIGN_ROUND_2 │───┐                          │
              │   └──────┬───────┘   │                          │
              │          │ all R2    │ TIMEOUT                  │
              │          ▼           │                          │
              │   ┌──────────────┐   │                          │
              └───│ SIGN_ROUND_3 │───┘                          │
                  └──────┬───────┘                              │
                         │ all R3                                │
                         ▼                                       │
                  ┌──────────────┐                               │
                  │  COMPLETE    │───────────────────────────────┘
                  └──────┬───────┘    (all error paths → READY)
                         │
                         ▼
                  ┌──────────────┐
                  │   READY      │
                  └──────────────┘
```

---

### 3c. Wallet Orchestrator

The Wallet Orchestrator provides a programmable abstraction over MPC wallets, handling transaction building, external wallet integration, and Stacks-specific operations.

#### 3c.1 External Wallet Abstraction

```typescript
interface ExternalWalletProvider {
  /** Derive a Stacks address from an EVM/Solana/other external wallet */
  deriveStacksAddress(externalAddress: string): Promise<string>;

  /** Verify ownership of external wallet via signature challenge */
  verifyOwnership(externalAddress: string, signature: string, message: string): Promise<boolean>;

  /** Get the chain type */
  readonly chain: 'ethereum' | 'solana' | 'bitcoin' | 'stacks';
}

class EthereumStacksMapper implements ExternalWalletProvider {
  readonly chain = 'ethereum';

  async deriveStacksAddress(ethAddress: string): Promise<string> {
    // Hash the ETH address → use as Stacks private key seed
    // Derive using @stacks/transactions utilities
    const seed = crypto.createHash('sha256')
      .update(`meluri:eth-to-stx:${ethAddress.toLowerCase()}`)
      .digest();
    return publicKeyToAddress(
      Buffer.from(getPublicKey(seed, true)).toString('hex'),
      'mainnet'
    );
  }

  async verifyOwnership(address: string, signature: string, message: string): Promise<boolean> {
    const msgHash = hashMessage(message);
    return verifyMessage(address, signature, msgHash);
  }
}
```

#### 3c.2 Programmable Wallet API

```typescript
interface ProgrammableWallet {
  /** Get wallet info */
  getInfo(): Promise<WalletInfo>;

  /** Build an unsigned STX transfer */
  buildStxTransfer(params: StxTransferParams): Promise<StacksTransaction>;

  /** Build an unsigned SIP-010 token transfer */
  buildTokenTransfer(params: TokenTransferParams): Promise<StacksTransaction>;

  /** Build an unsigned SIP-009 NFT transfer */
  buildNftTransfer(params: NftTransferParams): Promise<StacksTransaction>;

  /** Build an unsigned contract call */
  buildContractCall(params: ContractCallParams): Promise<StacksTransaction>;

  /** Estimate fee for a transaction */
  estimateFee(tx: StacksTransaction): Promise<FeeEstimate>;

  /** Request MPC signature on a transaction */
  sign(tx: StacksTransaction): Promise<SignedTransaction>;

  /** Sponsor and broadcast */
  broadcast(signedTx: SignedTransaction): Promise<BroadcastResult>;

  /** All-in-one: build, sign, broadcast */
  execute(params: TransactionParams): Promise<BroadcastResult>;
}

interface StxTransferParams {
  recipient: string;         // STX address
  amount: bigint;            // in microSTX
  memo?: string;
}

interface TokenTransferParams {
  contractAddress: string;   // SP...contract-name
  recipient: string;
  amount: bigint;            // in token base units
}

interface ContractCallParams {
  contractAddress: string;
  functionName: string;
  functionArgs: ClarityValue[];
  postConditions?: PostCondition[];
  postConditionMode?: PostConditionMode;
}
```

#### 3c.3 Stacks-Specific Transaction Building

```typescript
// Example: Building a sponsored STX transfer
async buildStxTransfer(params: StxTransferParams): Promise<UnsignedTx> {
  const network = this.config.network === 'mainnet'
    ? STACKS_MAINNET
    : STACKS_TESTNET;

  const tx = await makeUnsignedSTXTokenTransfer({
    recipient: params.recipient,
    amount: params.amount,
    memo: params.memo ?? '',
    publicKey: this.wallet.publicKey,
    network,
    fee: 0n,            // 0 because sponsored
    sponsored: true,    // sponsor pays fee
  });

  // Attach post-conditions if needed
  if (params.postConditions) {
    params.postConditions.forEach(pc => tx.addPostCondition(pc));
  }

  return {
    txHex: tx.serialize(),
    txBytes: tx.serializeBytes(),
    txid: tx.txid(),
    estimatedFee: await this.estimateFee(tx),
  };
}
```

**Supported Stacks operations:**

| Operation | Clarity Function | Post-Condition Required |
|-----------|:---:|:---:|
| STX transfer | (native) | No |
| SIP-010 `transfer` | `(transfer uint principal principal (optional buff))` | Yes |
| SIP-009 `transfer` | `(transfer uint principal principal)` | Yes |
| Contract call | (arbitrary) | Optional |
| STX delegation | `delegate-stx` | No |
| Stacking | `stack-stx` | No |

---

### 3d. SDK Design

#### 3d.1 Package Structure

```
@meluri/mpc/
├── src/
│   ├── index.ts              # Public API exports
│   ├── client.ts             # MeluriMPC main class
│   ├── types.ts              # TypeScript interfaces
│   ├── auth.ts               # MpcAuth — OAuth abstraction
│   ├── wallet.ts             # MpcWalletApi — REST calls to backend
│   ├── signing.ts            # MpcSigning — tx build + sign
│   ├── session.ts            # MpcSession — session key management
│   ├── turnkey.ts            # MpcTurnkey — Turnkey iframe integration
│   ├── react/                # React hooks (separate entry point)
│   │   ├── index.ts
│   │   ├── MeluriProvider.tsx
│   │   ├── useMeluriWallet.ts
│   │   ├── useMeluriSession.ts
│   │   └── useMeluriTransactions.ts
│   └── iframe/               # iframe auth modal (bundled separately)
│       ├── index.html
│       ├── modal.ts
│       └── postMessage.ts
├── package.json
├── tsconfig.json
└── dist/
```

`package.json` exports:
```json
{
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./react": {
      "import": "./dist/react/index.mjs",
      "require": "./dist/react/index.js",
      "types": "./dist/react/index.d.ts"
    }
  }
}
```

#### 3d.2 React Hooks API

```tsx
// MeluriProvider.tsx
import { createContext, useContext, useMemo, ReactNode } from 'react';
import { MeluriMPC, MeluriMPCConfig } from '@meluri/mpc';

const MeluriContext = createContext<MeluriMPC | null>(null);

export function MeluriProvider({
  config,
  children,
}: {
  config: MeluriMPCConfig;
  children: ReactNode;
}) {
  const client = useMemo(() => new MeluriMPC(config), [config.apiKey]);
  return (
    <MeluriContext.Provider value={client}>
      {children}
    </MeluriContext.Provider>
  );
}

export function useMeluri(): MeluriMPC {
  const ctx = useContext(MeluriContext);
  if (!ctx) throw new Error('useMeluri must be used within MeluriProvider');
  return ctx;
}

// useMeluriWallet.ts
export function useMeluriWallet() {
  const meluri = useMeluri();
  const [wallet, setWallet] = useState<MPCWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const login = useCallback(async () => {
    setLoading(true);
    try {
      const w = await meluri.login();
      setWallet(w);
      return w;
    } catch (e) {
      setError(e as Error);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [meluri]);

  const logout = useCallback(async () => {
    await meluri.logout();
    setWallet(null);
  }, [meluri]);

  return { wallet, login, logout, loading, error };
}

// useMeluriSession.ts
export function useMeluriSession(options?: { autoRenew?: boolean }) {
  const meluri = useMeluri();
  const [session, setSession] = useState<SessionStatus | null>(null);

  const createSession = useCallback(async (durMinutes?: number) => {
    const s = await meluri.createSession(durMinutes);
    setSession({ active: true, ...s });
    return s;
  }, [meluri]);

  useEffect(() => {
    if (options?.autoRenew) {
      const interval = setInterval(() => {
        const status = meluri.getSessionStatus();
        if (status && status.remainingMinutes < 5) {
          createSession(30);
        }
      }, 60_000);
      return () => clearInterval(interval);
    }
  }, [meluri, options?.autoRenew]);

  return { session, createSession };
}

// useMeluriTransactions.ts
export function useMeluriTransactions() {
  const meluri = useMeluri();
  const [balance, setBalance] = useState<BalanceResult | null>(null);
  const [txHistory, setTxHistory] = useState<TransactionRecord[]>([]);
  const [sending, setSending] = useState(false);

  const sendSTX = useCallback(async (params: SendSTXParams) => {
    setSending(true);
    try {
      return await meluri.sendSTX(params);
    } finally {
      setSending(false);
    }
  }, [meluri]);

  const sendToken = useCallback(async (params: SendTokenParams) => {
    setSending(true);
    try {
      return await meluri.sendToken(params);
    } finally {
      setSending(false);
    }
  }, [meluri]);

  const refresh = useCallback(async () => {
    const [b, txs] = await Promise.all([
      meluri.getAssets(),
      meluri.getTransactionHistory(),
    ]);
    setBalance(b);
    setTxHistory(txs);
  }, [meluri]);

  return { balance, txHistory, sendSTX, sendToken, sending, refresh };
}
```

**Usage example in developer dApp:**

```tsx
import { MeluriProvider, useMeluriWallet, useMeluriTransactions } from '@meluri/mpc/react';

function App() {
  return (
    <MeluriProvider config={{
      apiKey: 'ml_a1b2c3d4e5f6...',
      auth: new MpcAuth({ clerkKey: 'pk_test_...' }),
      network: 'testnet',
    }}>
      <WalletUI />
    </MeluriProvider>
  );
}

function WalletUI() {
  const { wallet, login, logout, loading } = useMeluriWallet();
  const { balance, sendSTX, sending } = useMeluriTransactions();

  if (loading) return <div>Loading...</div>;
  if (!wallet) return <button onClick={login}>Connect Wallet</button>;

  return (
    <div>
      <p>Address: {wallet.stxAddress}</p>
      <p>Balance: {balance?.stx?.balance ?? '0'} STX</p>
      <button onClick={() => sendSTX({ recipient: 'ST...', amount: 1000000 })} disabled={sending}>
        Send 1 STX
      </button>
      <button onClick={logout}>Disconnect</button>
    </div>
  );
}
```

#### 3d.3 Core SDK API

```typescript
class MeluriMPC {
  // Configuration
  constructor(config: MeluriMPCConfig);

  // Authentication
  login(): Promise<MPCWallet>;        // Full auth flow → wallet
  logout(): Promise<void>;            // Clear session + logout

  // Wallet
  getWallet(): Promise<MPCWallet>;    // Get or create MPC wallet

  // Session keys (delegated signing)
  createSession(durMinutes?: number): Promise<{ expiresAt: number; remainingMinutes: number }>;
  getSessionStatus(): SessionStatus | null;

  // Balances & History
  getBalance(): Promise<{ stx: string; tokens: TokenSummary[] }>;
  getAssets(): Promise<AssetBalances>;
  getTransactionHistory(): Promise<TransactionRecord[]>;

  // Transactions
  sendSTX(params: SendSTXParams): Promise<TxResult>;
  sendToken(params: SendTokenParams): Promise<TxResult>;
  sendNFT(params: SendNFTParams): Promise<TxResult>;
  batchSend(txs: BatchTx[]): Promise<TxResult[]>;
}
```

#### 3d.4 iframe Auth Modal Design

The iframe auth modal is loaded from a Meluri-hosted CDN endpoint and communicates with the parent dApp via `postMessage`:

```
┌────────────────────────────────────────────┐
│         Developer dApp (parent)             │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │       meluri-auth-modal iframe      │   │
│   │                                     │   │
│   │  ┌───────────────────────────────┐  │   │
│   │  │       Meluri MPC              │  │   │
│   │  │     ┌───┐ ┌───┐ ┌───┐        │  │   │
│   │  │     │ G │ │ X │ │ E │        │  │   │
│   │  │     └───┘ └───┘ └───┘        │  │   │
│   │  │     Google  X.com  Email     │  │   │
│   │  │                              │  │   │
│   │  │   ┌────────────────────┐     │  │   │
│   │  │   │  email@domain.com  │     │  │   │
│   │  │   │  [Continue]        │     │  │   │
│   │  │   └────────────────────┘     │  │   │
│   │  └───────────────────────────────┘  │   │
│   │                                     │   │
│   │  Powered by Meluri MPC              │   │
│   └─────────────────────────────────────┘   │
│                                             │
└────────────────────────────────────────────┘
```

#### 3d.5 postMessage Protocol

```typescript
// Parent → iframe messages
type ParentMessage =
  | { type: 'MELURI_INIT'; config: { apiKey: string; theme?: 'light' | 'dark' } }
  | { type: 'MELURI_CLOSE' };

// iframe → parent messages
type IframeMessage =
  | { type: 'MELURI_AUTH_SUCCESS'; payload: { userId: string; sessionToken: string; walletAddress: string } }
  | { type: 'MELURI_AUTH_ERROR'; payload: { code: string; message: string } }
  | { type: 'MELURI_SESSION_DELEGATION_REQUEST'; payload: { scopes: string[]; duration: number } }
  | { type: 'MELURI_SESSION_DELEGATION_APPROVED'; payload: { delegation: SessionDelegation } }
  | { type: 'MELURI_SESSION_DELEGATION_DENIED'; payload: {} }
  | { type: 'MELURI_IFRAME_READY' }
  | { type: 'MELURI_IFRAME_CLOSED' };

// Origin validation in both directions:
// - iframe only accepts messages from origins matching the developer's registered domain
// - parent only accepts messages from the Meluri auth origin
function isValidOrigin(event: MessageEvent, allowedOrigins: string[]): boolean {
  return allowedOrigins.some(origin => {
    if (origin.startsWith('*.')) {
      return event.origin.endsWith(origin.slice(1));
    }
    return event.origin === origin;
  });
}

// Initiation flow
function openMeluriAuthModal(config: { apiKey: string }): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://auth.meluri.xyz?apiKey=${config.apiKey}&origin=${window.location.origin}`;
    iframe.style.cssText = 'position:fixed;...';
    document.body.appendChild(iframe);

    window.addEventListener('message', function handler(event) {
      if (!isValidOrigin(event, ['https://auth.meluri.xyz'])) return;

      if (event.data.type === 'MELURI_AUTH_SUCCESS') {
        window.removeEventListener('message', handler);
        document.body.removeChild(iframe);
        resolve(event.data.payload);
      }
      if (event.data.type === 'MELURI_AUTH_ERROR') {
        window.removeEventListener('message', handler);
        document.body.removeChild(iframe);
        reject(new Error(event.data.payload.message));
      }
    });
  });
}
```

---

## 4. Data Models

### 4.1 Complete Prisma Schema

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Developer & Auth ──────────────────────────────────────────────

model Developer {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  apiKeys          ApiKey[]
  developerDomains DeveloperDomain[]
  refreshTokens    RefreshToken[]
  sessions         Session[]
}

model ApiKey {
  id          String   @id @default(cuid())
  developerId String
  developer   Developer @relation(fields: [developerId], references: [id])
  name        String
  keyHash     String   @unique        // SHA-256 of raw key
  keyPrefix   String                  // first 10 chars for UI display
  status      String   @default("Active")  // Active | Revoked | Expired
  permissions String[] @default(["read", "write", "mpc"])
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  createdAt   DateTime @default(now())

  mpcOrg          MpcOrganization?
  developerDomain DeveloperDomain?

  @@index([developerId])
  @@index([keyHash])
}

model DeveloperDomain {
  id          String   @id @default(cuid())
  developerId String
  developer   Developer @relation(fields: [developerId], references: [id])
  domain      String   @unique
  verified    Boolean  @default(false)
  dnsRecord   String?             // TXT record value for verification
  createdAt   DateTime @default(now())

  apiKeys ApiKey[]

  @@index([developerId])
}

model Session {
  id           String   @id @default(cuid())
  developerId  String
  developer    Developer @relation(fields: [developerId], references: [id])
  userId       String
  token        String   @unique
  refreshToken String?  @unique
  expiresAt    DateTime
  ipAddress    String?
  userAgent    String?
  deviceInfo   Json?
  createdAt    DateTime @default(now())
  revokedAt    DateTime?

  @@index([developerId])
  @@index([token])
  @@index([userId])
  @@index([expiresAt])
}

model RefreshToken {
  id          String   @id @default(cuid())
  developerId String
  developer   Developer @relation(fields: [developerId], references: [id])
  token       String   @unique
  sessionId   String
  expiresAt   DateTime
  family      String                  // token family for rotation detection
  createdAt   DateTime @default(now())
  usedAt      DateTime?
  revokedAt   DateTime?

  @@index([token])
  @@index([family])
}

// ─── MPC Organization ─────────────────────────────────────────────

model MpcOrganization {
  id                  String   @id @default(cuid())
  apiKeyId            String   @unique
  apiKey              ApiKey   @relation(fields: [apiKeyId], references: [id])
  turnkeyOrgId        String   @unique
  appName             String
  allowedDomains      String[]
  allowedAuthMethods  String[] @default(["google", "email", "wallet"])
  walletCount         Int      @default(0)
  txCount             Int      @default(0)
  signingThreshold    Int      @default(2)       // t-of-n threshold
  totalShareCount     Int      @default(3)       // n
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  wallets   MpcWallet[]
  keyShares MpcKeyShare[]
}

// ─── MPC Key Shares ───────────────────────────────────────────────

model MpcKeyShare {
  id              String   @id @default(cuid())
  orgId           String
  organization    MpcOrganization @relation(fields: [orgId], references: [id])
  walletId        String
  wallet          MpcWallet       @relation(fields: [walletId], references: [id])
  shareIndex      Int             // 1 = client, 2 = server-S1, 3 = server-S2
  holderId        String          // "client" | "server-s1" | "server-s2"
  encryptedShare  String          // AES-256-GCM encrypted key share
  encryptionKeyId String          // KMS key identifier used for encryption
  publicKey       String          // The aggregated public key (same for all shares)
  chainCode       String?         // BIP32 chain code (if HD derivation used)
  status          String  @default("active")  // active | rotated | revoked
  dkgSessionId    String?         // DKG ceremony session ID for audit
  createdAt       DateTime @default(now())
  rotatedAt       DateTime?

  @@unique([walletId, shareIndex])
  @@index([walletId])
  @@index([orgId])
}

// ─── MPC Wallet ───────────────────────────────────────────────────

model MpcWallet {
  id              String        @id @default(cuid())
  orgId           String
  organization    MpcOrganization @relation(fields: [orgId], references: [id])
  userId          String
  stxAddress      String        @unique
  publicKey       String        @unique
  turnkeyWalletId String        @unique
  network         String        @default("mainnet")
  derivationPath  String        @default("m/44'/5757'/0'/0/0")
  nonce           Int           @default(0)       // transaction nonce
  isActive        Boolean       @default(true)
  lastSyncedAt    DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  balances      MpcBalance[]
  transactions  MpcTransaction[]
  keyShares     MpcKeyShare[]
  signatures    MpcSignature[]

  @@index([orgId])
  @@index([userId])
  @@index([stxAddress])
}

// ─── MPC Signature ────────────────────────────────────────────────

model MpcSignature {
  id            String   @id @default(cuid())
  walletId      String
  wallet        MpcWallet @relation(fields: [walletId], references: [id])
  txid          String?
  messageHash   String                 // SHA-256 hash of the signed message
  r             String                 // signature r component
  s             String                 // signature s component
  v             Int?                   // recovery id
  participantIndices Int[]             // which shares participated [1, 2] or [1, 3]
  sessionId     String?                // WebSocket session ID for audit
  ceremonyDurationMs Int?              // how long the signing took
  status        String   @default("completed")  // completed | failed | aborted
  errorMessage  String?
  createdAt     DateTime @default(now())

  @@index([walletId])
  @@index([txid])
}

// ─── Balances ─────────────────────────────────────────────────────

model MpcBalance {
  id              String    @id @default(cuid())
  walletId        String
  wallet          MpcWallet @relation(fields: [walletId], references: [id], onDelete: Cascade)
  assetType       String    // STX | FT | NFT
  contractAddress String?
  symbol          String?
  name            String?
  decimals        Int       @default(6)
  balance         String
  tokenId         String?
  metadataUri     String?
  updatedAt       DateTime  @updatedAt

  @@unique([walletId, assetType, contractAddress, tokenId])
  @@index([walletId])
}

// ─── Transactions ─────────────────────────────────────────────────

model MpcTransaction {
  id             String    @id @default(cuid())
  walletId       String
  wallet         MpcWallet @relation(fields: [walletId], references: [id], onDelete: Cascade)
  txid           String
  type           String    // STX_TRANSFER | TOKEN_TRANSFER | CONTRACT_CALL | NFT_TRANSFER
  fromAddress    String
  toAddress      String?
  amount         String?
  assetSymbol    String?
  assetPrincipal String?
  fee            String?
  status         String    @default("pending")  // pending | confirmed | failed | dropped
  blockHeight    Int?
  microblockHash String?
  sponsored      Boolean   @default(false)
  network        String    @default("mainnet")
  rawTx          String?              // serialized transaction hex
  createdAt      DateTime  @default(now())
  confirmedAt    DateTime?

  @@unique([walletId, txid])
  @@index([walletId])
  @@index([txid])
  @@index([status])
}

// ─── External Wallet ──────────────────────────────────────────────

model ExternalWallet {
  id               String   @id @default(cuid())
  orgId            String
  organization     MpcOrganization @relation(fields: [orgId], references: [id])
  externalAddress  String               // ETH/SOL/BTC address
  externalChain    String               // ethereum | solana | bitcoin
  stxAddress       String   @unique     // derived Stacks address
  verified         Boolean  @default(false)
  verificationProof String?             // EIP-4361 or similar
  mpcWalletId      String?              // linked MPC wallet
  mpcWallet        MpcWallet? @relation(fields: [mpcWalletId], references: [id])
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([orgId, externalAddress, externalChain])
  @@index([stxAddress])
}

// ─── Simple Wallet (non-MPC fallback) ─────────────────────────────

model SimpleWallet {
  id         String   @id @default(cuid())
  userId     String   @unique
  stxAddress String   @unique
  publicKey  String   @unique
  privateKey String                // AES-256-GCM encrypted
  network    String   @default("testnet")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

### 4.2 Entity Relationship Summary

```
Developer 1──N ApiKey 1──0..1 MpcOrganization 1──N MpcWallet
                                                       │
                                            ┌──────────┼──────────┐
                                            │          │          │
                                     1──N MpcKeyShare 1──N MpcBalance 1──N MpcTransaction
                                            │
                                     1──N MpcSignature

Developer 1──N DeveloperDomain
Developer 1──N Session
Developer 1──N RefreshToken

MpcOrganization 1──N ExternalWallet 0..1──1 MpcWallet
```

---

## 5. API Design

### 5.1 REST Endpoints

All endpoints are prefixed with `/api/v1`.

#### Auth & Developer

| Method | Path | Auth | Request Body | Response |
|--------|------|:---:|--------------|----------|
| `POST` | `/auth/register` | None | `{ email, name, avatarUrl? }` | `Developer` |
| `POST` | `/auth/api-keys` | API Key | `{ name }` | `{ id, name, keyPrefix, rawKey, status, createdAt }` |
| `GET` | `/auth/api-keys` | API Key | — | `ApiKey[]` |
| `DELETE` | `/auth/api-keys/:id` | API Key | — | `204 No Content` |
| `POST` | `/auth/mpc/provision` | API Key | `{ appName, allowedDomains }` | `MpcOrganization` |
| `POST` | `/auth/domains` | API Key | `{ domain }` | `DeveloperDomain` |
| `GET` | `/auth/domains` | API Key | — | `DeveloperDomain[]` |
| `POST` | `/auth/session` | None | `{ userId, developerId, idToken }` | `{ token, refreshToken, expiresAt }` |
| `POST` | `/auth/session/refresh` | JWT | `{ refreshToken }` | `{ token, refreshToken, expiresAt }` |
| `DELETE` | `/auth/session` | JWT | — | `204 No Content` |

#### Wallets

| Method | Path | Auth | Description |
|--------|------|:---:|-------------|
| `POST` | `/wallets` | API Key | Register an MPC wallet |
| `GET` | `/wallets/:address` | API Key | Get wallet by Stacks address |
| `GET` | `/wallets/user/:userId` | API Key | Get wallet by end-user ID |
| `GET` | `/wallets/:address/assets` | API Key | Get all assets (STX, FTs, NFTs) |
| `GET` | `/wallets/:address/transactions` | API Key | Get transaction history (50 latest) |
| `POST` | `/wallets/:address/sync` | API Key | Force a balance/tx re-sync |

#### Transactions

| Method | Path | Auth | Request Body | Response |
|--------|------|:---:|--------------|----------|
| `POST` | `/tx/send` | API Key | `{ txHex, senderAddress, network?, delegation? }` | `{ txid, status }` |
| `POST` | `/tx/call-contract` | API Key | `{ contractAddress, functionName, functionArgs, senderAddress, delegation? }` | `{ txid, status }` |
| `POST` | `/tx/estimate-fee` | API Key | `{ txHex?, params?, network? }` | `{ estimatedFee, feeRate }` |
| `GET` | `/tx/:txid` | API Key | — | `MpcTransaction` |
| `GET` | `/tx/:txid/status` | API Key | — | `{ status, blockHeight?, confirmations? }` |

#### External Wallets

| Method | Path | Auth | Description |
|--------|------|:---:|-------------|
| `POST` | `/external-wallets` | API Key | Register an external wallet |
| `POST` | `/external-wallets/verify` | API Key | Challenge-response verification |
| `GET` | `/external-wallets/:stxAddress` | API Key | Get external wallet by derived Stacks address |

#### Simple Wallets (non-MPC)

| Method | Path | Auth | Description |
|--------|------|:---:|-------------|
| `POST` | `/wallets/simple` | None | Create a simple wallet |
| `GET` | `/wallets/simple/:userId` | None | Get simple wallet |
| `POST` | `/wallets/simple/send-tx` | None | Send STX |
| `POST` | `/wallets/simple/send-token` | None | Send SIP-010 token |

### 5.2 WebSocket Endpoints

#### Connection

```
wss://api.meluri.xyz/mpc?token=<jwt>
```

The JWT must include the `wallet` claim matching the wallet being operated on.

#### MPC Gateway (`/mpc`)

| Direction | Message Type | Description |
|-----------|-------------|-------------|
| Client → Server | `DKG_START` | Initiate DKG ceremony |
| Server → Client | `DKG_ROUND_1..4` | Forward round messages |
| Client → Server | `DKG_ROUND_1..4` | Submit round data |
| Server → Client | `DKG_COMPLETE` | DKG finished with encrypted share |
| Server → Client | `DKG_ERROR` | DKG failed with reason |
| Client → Server | `SIGN_START` | Initiate signing ceremony |
| Server → Client | `SIGN_ROUND_1..3` | Forward round messages |
| Client → Server | `SIGN_ROUND_1..3` | Submit round data |
| Server → Client | `SIGN_COMPLETE` | Signature ready |
| Server → Client | `SIGN_ERROR` | Signing failed |
| Client → Server | `KEY_REFRESH_START` | Initiate proactive key refresh |
| Either | `HEARTBEAT` | Keep-alive (every 15s) |
| Server → Client | `ERROR` | Protocol-level error |

#### Event Stream (`/events`)

```
wss://api.meluri.xyz/events?apiKey=<key>
```

| Event | Payload | Description |
|-------|---------|-------------|
| `wallet.created` | `{ userId, stxAddress, network }` | New wallet created |
| `transaction.sent` | `{ txid, from, to, amount }` | Transaction broadcast |
| `transaction.confirmed` | `{ txid, blockHeight, status }` | Transaction mined |
| `session.created` | `{ userId, expiresAt }` | Session key delegated |
| `session.expired` | `{ userId }` | Session key expired |

### 5.3 Response Envelope

All REST responses follow a standard envelope:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "requestId": "req_clx7k...",
    "timestamp": "2026-05-09T12:00:00Z"
  }
}
```

Error responses:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "WALLET_NOT_FOUND",
    "message": "Wallet not found for this user",
    "details": { "userId": "user_clx7k..." }
  },
  "meta": {
    "requestId": "req_clx7k...",
    "timestamp": "2026-05-09T12:00:00Z"
  }
}
```

---

## 6. Security Model

### 6.1 Key Encryption at Rest

| Data | Encryption | Key Management |
|------|-----------|----------------|
| Server-side MPC shares | AES-256-GCM | Cloud KMS (AWS KMS / GCP KMS) — key per environment, auto-rotated every 90 days |
| Client-side MPC share | AES-256-GCM | Derived from user passkey (WebAuthn PRF) or browser-generated recovery key |
| Simple wallet private keys | AES-256-GCM | Environment-specific encryption key, stored in KMS |
| Database credentials | — | KMS + Kubernetes secrets (sealed secrets) |
| JWT signing secret | — | KMS + Kubernetes secrets |

**Encryption wrapper:**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

async function encryptShare(plaintext: string, keyId: string): Promise<EncryptedShare> {
  const key = await kms.decrypt(keyId); // unwrap DEK from KMS
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    keyId,
    algorithm: ALGORITHM,
  };
}
```

### 6.2 Share Encryption in Transit

- **WebSocket connections**: TLS 1.3 only (WSS), with certificate pinning
- **Share messages**: each `MPC_ROUND_*` message payload is additionally encrypted with the session-specific symmetric key established during WebSocket handshake
- **Paillier ciphertexts within GG20 rounds**: already encrypted under the recipient's Paillier public key; this provides defense-in-depth

### 6.3 JWT Security

| Property | Value |
|----------|-------|
| Algorithm | HS256 (HMAC-SHA-256) |
| Key rotation | Every 30 days, with 7-day overlap for validation |
| Token lifetime | 2 hours (access), 30 days (refresh) |
| Refresh rotation | One-time use; new refresh token issued on each refresh |
| Reuse detection | If a used refresh token is replayed, entire token family is revoked |
| Claims validation | `iss`, `aud`, `exp`, `iat`, `jti` all validated server-side |

### 6.4 CORS Policy

```typescript
// In production, CORS is restricted to verified developer domains
app.enableCors({
  origin: (origin, callback) => {
    // Allow if origin matches a verified developer domain OR is meluri infrastructure
    if (!origin) return callback(null, true);
    if (origin.endsWith('.meluri.xyz')) return callback(null, true);
    if (origin === 'http://localhost:3000' || origin.startsWith('http://localhost:')) {
      return callback(null, true); // development only
    }
    // Check against registered domains in PostgreSQL (cached in Redis)
    this.domainService.isAllowed(origin)
      .then(allowed => callback(null, allowed))
      .catch(err => callback(err, false));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  maxAge: 86400,
});
```

### 6.5 Rate Limiting

| Endpoint Group | Limit | Window | Scope |
|---------------|:-----:|:------:|-------|
| `/auth/register` | 5 | 1 hour | IP |
| `/auth/session` | 20 | 1 minute | IP |
| `/auth/api-keys` | 10 | 1 minute | API Key |
| `/wallets/*` (read) | 300 | 1 minute | API Key |
| `/wallets/*` (write) | 60 | 1 minute | API Key |
| `/tx/send` | 100 | 1 minute | API Key |
| WebSocket `/mpc` connections | 50 | per wallet | Wallet ID |
| WebSocket `/events` connections | 5 | per API key | API Key |

Implemented via `@nestjs/throttler` with Redis store:

```typescript
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      name: 'default',
      ttl: 60000,
      limit: 300,
    }]),
  ],
})
// Per-route overrides:
@Throttle({ default: { limit: 5, ttl: 3600000 } })
@Post('register')
register() { ... }
```

### 6.6 API Key Hashing

```typescript
// Generation (Auth Service)
const rawKey = `ml_${crypto.randomBytes(32).toString('hex')}`;
// → ml_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2

const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
// → Only the hash is stored in PostgreSQL

const keyPrefix = rawKey.slice(0, 10);
// → "ml_a1b2c3d" — shown in dashboard for identification

// Verification (ApiKeyGuard)
const keyHash = crypto.createHash('sha256').update(rawKeyFromHeader).digest('hex');
const apiKey = await prisma.apiKey.findUnique({ where: { keyHash } });
```

The raw key is returned **only once** at creation time. It cannot be retrieved afterward. Developers must store it securely.

### 6.7 Additional Security Measures

- **Constant-time comparison** for API key validation (SHA-256 hash lookup + randomized delay on failure)
- **Request signing** for MPC ceremony messages using HMAC with a per-session key
- **Audit logging** of all DKG ceremonies, signing ceremonies, key refreshes, and admin actions (to a separate, append-only log store)
- **Proactive key refresh** protocol — MPC shares are rotated every 90 days or after `N` signing operations (configurable per developer)
- **No plaintext private keys** ever logged; `Logger` is configured to redact known sensitive fields
- **Supply chain**: all dependencies pinned with `pnpm-lock.yaml`, SBOM generation in CI for audit

---

## 7. Deployment Architecture

### 7.1 Docker Containers

```
┌─────────────────────────────────────────────────────────────────┐
│                      Docker Compose (dev)                        │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ PostgreSQL 16│  │   Redis 7    │  │   meluri-api          │  │
│  │ (Alpine)    │  │   (Alpine)   │  │   (Node 18, NestJS)   │  │
│  │             │  │              │  │                       │  │
│  │ Port: 5432  │  │ Port: 6379   │  │   Port: 4002          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  meluri-mpc-ws  (Node 18, NestJS + ws)                      ││
│  │  Port: 4003                                                  ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**`docker-compose.prod.yml`** (production):

```yaml
version: "3.8"

services:
  # ── API ────────────────────────────────────────
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "4002:4002"
    environment:
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@postgres:5432/meluri_mpc
      - REDIS_URL=redis://redis:6379
      - TURNKEY_API_PUBLIC_KEY=${TURNKEY_API_PUBLIC_KEY}
      - TURNKEY_API_PRIVATE_KEY=${TURNKEY_API_PRIVATE_KEY}
      - TURNKEY_ORGANIZATION_ID=${TURNKEY_ORGANIZATION_ID}
      - HIRO_API_URL=${HIRO_API_URL}
      - VELUMX_RELAYER_URL=${VELUMX_RELAYER_URL}
      - VELUMX_RELAYER_API_KEY=${VELUMX_RELAYER_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - KMS_KEY_ID=${KMS_KEY_ID}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 512M

  # ── MPC WebSocket ──────────────────────────────
  mpc-ws:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: mpc-ws
    ports:
      - "4003:4003"
    environment:
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@postgres:5432/meluri_mpc
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - KMS_KEY_ID=${KMS_KEY_ID}
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 2    # S1 and S2 can run on separate pods
      resources:
        limits:
          cpus: '2'
          memory: 1G

  # ── PostgreSQL ─────────────────────────────────
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: meluri_mpc
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d meluri_mpc"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

  # ── Redis ──────────────────────────────────────
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── SDK CDN Proxy ───────────────────────────────
  sdk-cdn:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./packages/sdk/dist:/usr/share/nginx/html/sdk:ro
      - ./infra/nginx/sdk-cdn.conf:/etc/nginx/conf.d/default.conf:ro

volumes:
  pgdata:
  redisdata:
```

### 7.2 Kubernetes Services

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                                │
│                                                                         │
│  Namespace: meluri-prod                                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Ingress (nginx-ingress-controller)                              │   │
│  │  • api.meluri.xyz → meluri-api:4002                              │   │
│  │  • mpc.meluri.xyz → meluri-mpc-ws:4003 (WebSocket upgrade)      │   │
│  │  • auth.meluri.xyz → meluri-auth:3000                            │   │
│  │  • cdn.meluri.xyz → meluri-cdn:8080                              │   │
│  │  • TLS: cert-manager + Let's Encrypt                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐   │
│  │ meluri-api    │  │ meluri-mpc-ws │  │ meluri-auth (Next.js)     │   │
│  │ Deployment    │  │ StatefulSet   │  │ Deployment                │   │
│  │              │  │              │  │                          │   │
│  │ replicas: 3   │  │ replicas: 2   │  │ replicas: 2              │   │
│  │ autoscale:    │  │ pod-id: S1,S2 │  │ autoscale: CPU > 70%     │   │
│  │  C2-4/512Mi   │  │ C4-8/1Gi      │  │ C1-2/256Mi               │   │
│  └───────────────┘  └───────────────┘  └───────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  meluri-relayer (Deployment)                                     │   │
│  │  replicas: 2  |  resources: C1-2/256Mi                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐   │
│  │ PostgreSQL (Cloud SQL│  │ Redis (Memorystore / ElastiCache)    │   │
│  │ or Crunchy Data)    │  │                                      │   │
│  │                     │  │  • Session token blacklist            │   │
│  │ Primary + Read      │  │  • Rate-limit counters                │   │
│  │ Replica for         │  │  • MPC ceremony ephemeral state       │   │
│  │ indexing queries    │  │  • Transaction nonce cache             │   │
│  └──────────────────────┘  └──────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Secrets (Sealed Secrets / External Secrets Operator)            │   │
│  │  • DATABASE_URL, REDIS_URL, JWT_SECRET                          │   │
│  │  • TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY              │   │
│  │  • VELUMX_RELAYER_API_KEY, KMS_KEY_ID                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Scaling Strategy

| Component | Strategy | Triggers | Min | Max |
|-----------|----------|----------|:---:|:---:|
| `meluri-api` | Horizontal Pod Autoscaler (HPA) | CPU > 70% OR req/s > 500 | 2 | 10 |
| `meluri-mpc-ws` | StatefulSet with fixed pods (S1, S2) | Manual scale (stateful shares) | 2 | 2 |
| `meluri-auth` | HPA | CPU > 60% | 2 | 5 |
| `meluri-relayer` | HPA | Queue depth > 100 | 2 | 8 |
| PostgreSQL | Connection pooling (PgBouncer) + read replicas | — | 1 primary + 1 replica | 1 primary + 3 replicas |
| Redis | Cluster mode if memory > 4GB | — | 1 primary | 3 (cluster) |

**MPC WebSocket scaling note**: The MPC service is stateful (each pod holds a distinct key share). It scales by adding more `share-holder` pods (for n > 3 thresholds), not by horizontal replication. The coordinator can be scaled horizontally since it's stateless.

### 7.4 SDK CDN Delivery

The browser SDK (`@meluri/mpc`) and the iframe auth modal are served via CDN:

```
                          ┌─────────────────┐
                          │   Cloudflare CDN │
                          │                 │
   User Browser           │  cdn.meluri.xyz │
   ───────────────>       │                 │
   <script src="https://   │  /sdk/mpc.js    │── Origin: meluri-cdn (K8s nginx)
    cdn.meluri.xyz/       │  /sdk/mpc.mjs   │   or S3 bucket
    sdk/v0.1/mpc.js">     │  /auth/iframe.  │
                          │    html          │
                          └─────────────────┘
```

**Versioning strategy:**
- `/sdk/v0.1/mpc.js` — major.minor pinned (immutable, 1-year cache)
- `/sdk/latest/mpc.js` — latest release (short TTL, 5-minute cache)
- Subresource Integrity (SRI) hashes published in docs

```html
<script
  src="https://cdn.meluri.xyz/sdk/v0.1/mpc.js"
  integrity="sha384-<hash>"
  crossorigin="anonymous">
</script>
```

### 7.5 CI/CD Pipeline

```
Git Push (main)
    │
    ▼
┌─────────────────────────────────────────────┐
│  GitHub Actions                              │
│                                             │
│  1. Lint & Type-check (pnpm lint)           │
│  2. Unit tests (jest)                       │
│  3. Build Docker images                     │
│  4. Push to container registry (GHCR)       │
│  5. Run integration tests (testnet)         │
│  6. Deploy to staging (auto)                │
│  7. Smoke tests on staging                  │
│  8. Deploy to production (manual approval)  │
│  9. Run DB migrations (prisma migrate deploy)│
│  10. Publish SDK to npm registry            │
│  11. Purge CDN cache for /latest/* paths    │
└─────────────────────────────────────────────┘
```

### 7.6 Monitoring & Observability

| Layer | Tool | Metrics |
|-------|------|---------|
| Application | OpenTelemetry → Grafana | Request latency, error rate, MPC ceremony duration, signing throughput |
| Infrastructure | Prometheus + Grafana | CPU, memory, disk, network per pod |
| Logs | Loki / ELK | Structured JSON logs with traceId correlation |
| Alerts | Grafana AlertManager | API error rate > 1%, signing failure rate > 0.5%, DB connection pool exhaustion |
| Uptime | UptimeRobot / Grafana Synthetic | Health endpoint checks from 3 regions |

**Key business metrics dashboard:**
- Wallets created (per developer, per day)
- Transactions sponsored (per day)
- MPC ceremonies completed (DKG + Sign)
- Active sessions (end-user)
- SDK load count (CDN logs)
- API key usage (per endpoint, per developer)
