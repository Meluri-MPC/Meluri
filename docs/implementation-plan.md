# Meluri MPC — Implementation Plan

**Version:** 0.1.0

---

## 1. Overview

Meluri MPC is an embedded wallet infrastructure purpose-built for the Stacks ecosystem. It provides developers with a drop-in wallet solution that eliminates the friction of external wallet extensions while preserving self-custody through threshold cryptography. Conceptually, it is "Privy for Stacks" — offering the same seamless onboarding experience but with Stacks-native primitives, a Byzantine-resilient MPC architecture, and native gas sponsorship via VelumX.

**Core capabilities:**

| Capability | Description |
|---|---|
| **Social Auth** | End-users authenticate via Google, Apple, GitHub, Discord, Twitter, or email (passcode). No crypto wallet required at sign-up. |
| **MPC Key Management** | A 2-of-3 Threshold Signature Scheme (TSS) distributes key shares across the Meluri server, the user's browser, and an encrypted recovery share. No single party can sign alone. |
| **Programmable Wallets** | Developers choose: (a) use the MPC wallet automatically provisioned for users, or (b) let users connect external Stacks wallets (Xverse, Leather). Both exposed through a unified interface. |
| **Gas Sponsorship** | Transactions are relayed through VelumX, which sponsors gas fees. End-users never need STX to transact. |
| **Developer Dashboard** | Web UI for managing API keys, configuring auth providers, whitelisting domains, and viewing usage analytics. |

**Target audience:** Stacks dApp developers who want to onboard users without requiring them to install a browser extension or understand seed phrases.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Browser)                              │
│  ┌──────────────────────────────┐   ┌────────────────────────────────┐  │
│  │  Iframe Auth Modal           │   │  dApp                           │  │
│  │  (meluri.xyz/auth)           │   │  @meluri/react / @meluri/core   │  │
│  │                              │   │                                 │  │
│  │  OAuth / Email flow          │   │  <MeluriProvider>               │  │
│  │  ──────────────────►         │   │  useMeluriWallet()              │  │
│  │  postMessage: {token} ───────┼───┼─► receives JWT + key share     │  │
│  │                              │   │  manages WebSocket to MPC svc   │  │
│  │  Encrypts & stores           │   │  manages session keys           │  │
│  │  client-side key share       │   │                                 │  │
│  └──────────────────────────────┘   └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                │                                   │
                ▼                                   ▼
┌───────────────────────┐   ┌───────────────────────────────────────────┐
│  Developer Dashboard  │   │  Auth Service (NestJS)                    │
│  (Next.js)            │   │  Port 4002                                │
│                       │   │                                           │
│  • API key mgmt       │   │  OAuth2 Handlers (Google, Apple, GitHub,  │
│  • Auth provider cfg  │   │    Discord, Twitter)                      │
│  • Domain whitelist   │   │  Email/Passcode (OTP)                     │
│  • Usage analytics    │   │  JWT issuance & verification              │
│  • Webhook endpoints  │   │  Multi-tenant (API key → sub-org)         │
│                       │   │  Session management (Redis)               │
│                       │   │                                           │
│                       │   │  POST /api/v1/auth/oauth/:provider        │
│                       │   │  POST /api/v1/auth/email/login            │
│                       │   │  POST /api/v1/auth/email/verify           │
│                       │   │  GET  /api/v1/auth/session                │
│                       │   │  POST /api/v1/auth/logout                 │
└───────────────────────┘   └───────────────────────────────────────────┘
                                            │
                                            ▼
┌───────────────────────────────────────────────────────────────────────┐
│  MPC Service (NestJS + WebSocket)                                     │
│  Port 4003                                                            │
│                                                                       │
│  • DKG Coordinator (2-of-3 TSS over secp256k1)                        │
│    - Share A: Server (encrypted at rest, HSM-backed in prod)           │
│    - Share B: Client browser (WebCrypto encrypted, IndexedDB stored)  │
│    - Share C: Recovery share (encrypted with user passphrase)         │
│                                                                       │
│  • Signing Ceremony (WebSocket protocol)                               │
│    Client ──WS──► Server                                              │
│    Client: "sign {txHash, sessionDelegation}"                         │
│    Server: computes partial sig from Share A                          │
│    Server ──WS──► Client                                              │
│    Client: computes partial sig from Share B                          │
│    Client: combines partials → full ECDSA signature                   │
│                                                                       │
│  • Recovery Ceremony                                                   │
│    Uses Share C + Share A (or Share B) to reconstruct wallet          │
│                                                                       │
│  • Share Refresh (proactive security)                                 │
│    Periodic re-sharing without changing the underlying private key     │
│                                                                       │
│  State: key share metadata in PostgreSQL, live ceremony state in Redis│
└───────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Wallet Orchestrator                                                   │
│                                                                       │
│  Unified wallet interface behind a single abstraction:                │
│                                                                       │
│  ┌─ MPC Wallet ──────────┐   ┌─ External Wallet ──────────────────┐  │
│  │ • Derived from TSS    │   │ • Xverse (StacksProvider)           │  │
│  │ • sign() → MPC svc    │   │ • Leather (StacksProvider)          │  │
│  │ • address derivation  │   │ • sign() → wallet extension         │  │
│  │   via BIP44           │   │ • address from extension            │  │
│  └───────────────────────┘   └────────────────────────────────────┘  │
│                                                                       │
│  Transaction construction: @stacks/transactions                       │
│  Broadcast via Relayer Service (VelumX)                               │
└───────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Relayer Service (VelumX)                                              │
│                                                                       │
│  • Accepts signed raw transaction hex                                  │
│  • Sponsors fee via VelumX API                                        │
│  • Broadcasts to Stacks node                                          │
│  • Returns txid                                                        │
│                                                                       │
│  POST /api/v1/relayer/broadcast                                       │
│  POST /api/v1/relayer/estimate                                        │
└───────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────┐
                    │  Data Stores              │
                    │                           │
                    │  PostgreSQL (Prisma)       │
                    │  • Users, API keys         │
                    │  • Wallets, balances       │
                    │  • Transactions            │
                    │  • MPC key share metadata  │
                    │                           │
                    │  Redis                     │
                    │  • JWT session tokens      │
                    │  • Active signing ceremony │
                    │    state                   │
                    │  • Rate limiting           │
                    │  • OTP codes (TTL)         │
                    └──────────────────────────┘
```

### Component Interactions

1. **Auth flow:** dApp renders `<MeluriProvider>`. SDK injects an iframe pointing to `meluri.xyz/auth`. User completes OAuth/email flow inside the iframe. The iframe returns a JWT via `postMessage`. The SDK stores the JWT in memory.

2. **MPC wallet creation:** After first auth, SDK sends JWT → Auth Service (verified) → MPC Service initiates DKG. The MPC service generates the key in a distributed fashion: the server generates its share, the client generates its share, both exchange commitments and partial information via WebSocket. The resulting Stacks address is derived from the joint public key.

3. **Signing flow:** SDK constructs a Stacks transaction via `@stacks/transactions`, hashes it, then opens a WebSocket to MPC Service. Both parties compute partial ECDSA signatures over their shares of the private key. The client combines partials and returns the signed transaction.

4. **Gas Sponsorship:** The fully signed transaction hex is POSTed to the Relayer Service, which forwards it to VelumX for sponsorship and broadcast.

---

## 3. Phases & Timelines

### Phase 1: Auth Service (6 weeks)

**Goal:** Complete end-user authentication with social providers. Developer dashboard for API key management. Initial SDK.

| Week | Deliverables |
|---|---|
| **W1–2** | OAuth2 provider integrations: Google, Apple, GitHub. Each implements the standard OAuth2 authorization code flow with PKCE. Redirect URIs are configured per-sub-org (per developer API key). |
| **W3** | Discord and Twitter OAuth2 providers. Email passcode auth (generate 6-digit OTP, store hashed in Redis with 5-min TTL, send via Resend or SendGrid). |
| **W4** | JWT issuance logic: on successful auth, issue an opaque JWT containing `{ sub: userId, org: orgId, scope, iat, exp }` signed with RS256. Multi-tenant middleware — extract API key from `x-api-key` header, resolve sub-org, scope JWT to that org. Clerk removal from SDK; SDK now uses Meluri's own auth. |
| **W5** | SDK auth module: `@meluri/core` with `MeluriAuth` class. Iframe-based auth modal served at `auth.meluri.xyz`. Communication via `postMessage`. Session persistence in memory with automatic refresh. |
| **W6** | Dashboard auth pages (sign-in, sign-up with Clerk or Meluri auth). API key CRUD in dashboard. Infrastructure: Docker Compose, env management, CI pipeline (GitHub Actions — lint, typecheck, test, build containers). |

**Key decisions locked in Phase 1:**
- JWT stored in httpOnly cookie (iframe domain) + accessible via JavaScript for SDK.
- OAuth2 PKCE with state parameter for CSRF protection.
- Email OTP via Redis `SETEX meluri:otp:<email> 300 <hashed-code>`.

### Phase 2: MPC Service (8 weeks)

**Goal:** Replace Turnkey dependency with an in-house 2-of-3 Threshold Signature Scheme over secp256k1. This is the core differentiation from Privy/Web3Auth.

| Week | Deliverables |
|---|---|
| **W1–2** | TSS library implementation. Port a verified ECDSA TSS implementation (reference: GG20 protocol) to TypeScript. The library must support: (a) key generation (DKG) with 2-of-3 threshold, (b) signing with 2 shares, (c) share refresh (proactive security). Core primitives over `@noble/secp256k1`. |
| **W3–4** | DKG Coordinator. NestJS WebSocket gateway (`@nestjs/websockets` + `socket.io`). Protocol: (1) Client sends `dkg_init` with JWT, (2) Server validates JWT, resolves sub-org, (3) Both parties run 3 rounds of DKG exchanging commitments, (4) Server stores encrypted Share A in PostgreSQL, sends Share B to client (client encrypts with WebCrypto), (5) Server generates Share C (recovery) encrypted with a key derived from the user's email + server secret, stored in PostgreSQL. |
| **W5–6** | Signing Ceremony. WebSocket protocol: `sign_init { txHash }` → server computes partial from Share A → sends to client → client computes partial from Share B → client combines partials into full ECDSA signature. Session delegation for repeated signing without full ceremony: client generates an ephemeral secp256k1 keypair, signs a delegation message with the MPC key (one ceremony), then uses the ephemeral key for subsequent signings within a time window (default 30 min). Backend verifies delegation signature. |
| **W7** | Recovery ceremony. Two scenarios: (a) User still has Share B → reshare without Share C, (b) User lost browser → Combine Share A + Share C using the user's email as decryption key. Recovery requires email OTP verification. Share refresh: a scheduled cron job refreshes Share A and Share C without changing the underlying private key, rotating server-side material every 90 days. |
| **W8** | MPC Worker infrastructure. Deploy MPC service as a separate deployable (separate container) from the Auth Service. Redis pub/sub for cross-instance ceremony coordination (multiple MPC instances behind a load balancer). Integration tests for DKG + signing + recovery end-to-end. |

**Protocol Choice — Why GG20:**

The GG20 protocol (Gennaro & Goldfeder, 2020) is chosen because:
- It is well-documented and has multiple open-source reference implementations.
- It supports arbitrary thresholds (t-of-n) with t = 2, n = 3.
- It has been audited in production (used by Fireblocks, Coinbase, and others).
- It avoids key recovery during signing (the private key never exists on any single machine).
- Signing requires 4 rounds of interaction (acceptable for WebSocket latency ~50–100ms).

**Key Share Storage:**

| Share | Location | Encryption |
|---|---|---|
| Share A | PostgreSQL `key_shares` table, column `server_share` | AES-256-GCM, key from KMS/env secret |
| Share B | Browser IndexedDB | AES-256-GCM via WebCrypto, key derived from JWT session |
| Share C | PostgreSQL `key_shares` table, column `recovery_share` | AES-256-GCM, key = SHA-256(userEmail + serverSecret) |

### Phase 3: Wallet Orchestration (3 weeks)

**Goal:** Unify MPC wallets and external wallets behind a single programmatic interface.

| Week | Deliverables |
|---|---|
| **W1** | External wallet connector. Implement `StacksWalletProvider` interface that adapts Xverse and Leather browser extensions. Detect injected `window.StacksProvider` or `window.LeatherProvider`. Standardize to a `WalletClient` interface: `{ getAddresses(): Promise<string[]>; signTransaction(tx): Promise<string>; signMessage(msg): Promise<string> }`. |
| **W2** | Programmable wallet abstraction. `WalletOrchestrator` class in the SDK that presents a unified API: `.connect(type: 'mpc' | 'xverse' | 'leather')`, `.getAddress()`, `.signAndSend(tx)`. For MPC wallets, signing routes through the MPC ceremony; for external wallets, delegates to the extension. Transaction construction always uses `@stacks/transactions`. |
| **W3** | UI Kit. React components for wallet selection modal: `WalletSelector`, `WalletButton` (for each provider), network badge, address display, disconnect button. Shadcn/ui-based components in `@meluri/react/ui`. Tailwind-styled. |

### Phase 4: SDK & Developer Experience (2 weeks)

**Goal:** Polished, well-documented SDK for both React and vanilla JS developers.

| Week | Deliverables |
|---|---|
| **W1** | SDK packaging. Split current `@meluri/mpc` (now `@meluri/core`) and create new `@meluri/react`. Core package: framework-agnostic, no React dependency. React package: `<MeluriProvider>`, `useMeluriAuth()`, `useMeluriWallet()`, `useSendTransaction()`, `useSessionKey()`. Published to npm under `@meluri` scope. |
| **W2** | Documentation site (VitePress or Nextra). Sections: Quick Start, Installation, Auth Configuration, Wallets, Signing, Gas Sponsorship, API Reference, Migration Guide (from Turnkey to native MPC). Example apps: a Next.js demo, a Vite/React demo. Demo app in `apps/demo` updated to use `@meluri/react`. |

### Phase 5: Production Hardening (2 weeks)

**Goal:** Security audit readiness and production deployment infrastructure.

| Week | Deliverables |
|---|---|
| **W1** | Security review. Penetration test plan against OWASP Top 10 for the auth flow (CSRF, XSS, open redirect in OAuth, JWT replay). MPC threat model: share extraction, man-in-the-middle on WebSocket, key-share compromise scenarios. Dependency audit (`pnpm audit`). Rate limiting on auth endpoints (60 req/min per IP via Redis). Input validation hardened. |
| **W2** | Kubernetes manifests. Deployment descriptors for: auth-service, mpc-service, dashboard (static), redis, postgres. Horizontal Pod Autoscaling for auth-service (CPU > 70%). NetworkPolicy for inter-service communication. TLS termination at ingress (cert-manager + Let's Encrypt). Monitoring: Prometheus metrics endpoint on each service, Grafana dashboard for latency/error rate/ceremony duration, alerting via PagerDuty or Slack webhook. Logging: structured JSON logs, shipped to Loki or CloudWatch. |

---

## 4. Technical Decisions

### 4.1 TSS (Threshold Signature Scheme) over "Plain" MPC

| Aspect | Plain MPC (e.g., general 2PC) | TSS (2-of-3) |
|---|---|---|
| Signing parties | Typically 2-server | Server + Client + Recovery |
| Byzantine resilience | 1-of-2 (if one server is down, wallet frozen) | 2-of-3 (can tolerate 1 share loss) |
| User experience | User has no direct share; purely server-side | User's browser holds Share B → true self-custody |
| Recovery UX | Server-only recovery | Recovery share C allows recovery even if Meluri servers are lost |
| Latency overhead | 100–200ms per signing | ~4 rounds of messages (200–400ms total) |

**Decision:** 2-of-3 TSS. The 2-of-3 threshold gives us: (a) liveness — signing works with any 2 of 3 shares, (b) self-custody — the user's browser holds a share so the server alone cannot sign, (c) recovery — Share C provides a fallback path.

### 4.2 NestJS over Express/Fastify

| Criterion | Express | Fastify | NestJS |
|---|---|---|---|
| Module system | Manual | Manual | Built-in DI + modules |
| WebSocket support | Requires `ws` lib | Requires `@fastify/websocket` | First-class with `@nestjs/websockets` |
| Swagger | Manual setup | Manual setup | `@nestjs/swagger` decorators |
| Testing | Manual setup | Manual setup | `@nestjs/testing` with DI |
| TypeScript DX | Manual types | Good types | Decorator-driven, opinionated |

**Decision:** NestJS. The module system aligns with our multi-service architecture (auth module, mpc module, wallet module, etc.). WebSocket support is critical for Phase 2 MPC ceremonies and NestJS provides `@WebSocketGateway()` as a first-class abstraction. The codebase already uses NestJS.

### 4.3 WebSocket over HTTP for MPC Communications

| Aspect | HTTP (REST) | WebSocket |
|---|---|---|
| Bidirectional | No (polling required) | Yes |
| Latency per round trip | ~100ms + connection overhead | ~50ms on established connection |
| Stateful ceremonies | Requires external state (Redis) | Connection-scoped state |
| TSS signing rounds | 4 HTTP calls (painful) | 4 messages over 1 connection |

**Decision:** WebSocket via `@nestjs/websockets` with socket.io. The signing ceremony requires 4 rounds of message exchange. Each HTTP round trip adds connection overhead. WebSocket keeps the TCP connection warm, reducing ceremony latency. Session identity is established on connection via JWT in the auth handshake.

### 4.4 Redis for Session and MPC State

- **JWT sessions:** Keyed as `session:<jti>` with user/org metadata, TTL = JWT expiry. Enables server-side session invalidation.
- **Active signing ceremonies:** Keyed as `ceremony:<walletId>`, holds ephemeral round state (commitments, nonces, partial signatures). TTL = 30s (ceremonies are short-lived).
- **Rate limiting:** Sliding-window counters per IP and per API key.
- **OTP codes:** `otp:<email>` with 5-min TTL.

**Why Redis over in-memory:** Multiple instances of auth-service and mpc-service run behind a load balancer. Redis provides shared state. In-memory caches would break sticky-session requirements.

### 4.5 PostgreSQL via Prisma

Already in use. Schema already models `Developer`, `ApiKey`, `MpcOrganization`, `MpcWallet`, `MpcBalance`, `MpcTransaction`.

**New tables for Phase 2 (MPC):**

```sql
-- Key shares for TSS
CREATE TABLE key_shares (
  id            TEXT PRIMARY KEY,
  wallet_id     TEXT NOT NULL REFERENCES mpc_wallets(id),
  server_share  TEXT NOT NULL,  -- AES-256-GCM encrypted, base64
  recovery_share TEXT NOT NULL, -- AES-256-GCM encrypted, base64
  share_version INT NOT NULL DEFAULT 1,
  rotated_at    TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- DKG ceremony audit log
CREATE TABLE ceremony_logs (
  id          TEXT PRIMARY KEY,
  wallet_id   TEXT NOT NULL,
  ceremony_type TEXT NOT NULL,  -- 'dkg', 'sign', 'refresh', 'recovery'
  status      TEXT NOT NULL,    -- 'initiated', 'completed', 'failed'
  error       TEXT,
  duration_ms INT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 4.6 WebCrypto API for Client-Side Share Encryption

The client-side key share (Share B) is encrypted before storage in IndexedDB:

```
Key derivation: PBKDF2(sessionSecret, salt, 100000 iterations) → 256-bit AES-GCM key
Encryption:      AES-256-GCM(shareBytes, key, iv) → stored in IndexedDB
Decryption:      on auth, derive key from session, decrypt → use in signing ceremony
```

`sessionSecret` is derived from the JWT's `jti` claim, making the share un-decryptable after session expiry/logout.

### 4.7 React SDK with Iframe / postMessage for Embedded Auth

**Why iframe over redirect:**
- Prevents dApp context loss (no full-page navigation).
- Better UX — auth modal appears in-page.
- Security isolation — auth domain (`auth.meluri.xyz`) is a separate origin from the dApp, containing cookies and tokens.

**Protocol:**

```
[meluri.xyz/auth iframe]                         [dApp]
        │                                           │
        │  postMessage: { type: 'MELURI_AUTH_READY' }│
        │──────────────────────────────────────────►│
        │                                           │
        │  user completes OAuth/email flow          │
        │                                           │
        │  postMessage: { type: 'MELURI_AUTH_TOKEN', │
        │                  token: '<jwt>' }         │
        │──────────────────────────────────────────►│
        │                                           │
        │                              SDK stores   │
        │                              JWT, opens   │
        │                              WebSocket    │
```

Origin validation: SDK only accepts messages from `https://auth.meluri.xyz`. Iframe only accepts parent origins registered as `allowedDomains` in the developer's sub-org configuration.

---

## 5. Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **TSS implementation bugs introducing signing failures** | Critical | Medium | Reference implementation audited by third party before Phase 2 production. Comprehensive test suite with known-answer tests against ECDSA test vectors. Canary deployment — roll out MPC to 1% of wallets before full migration. |
| **Key share compromise (server-side)** | Critical | Low | Server share encrypted at rest with AES-256-GCM. Encryption key stored in KMS (AWS KMS or HashiCorp Vault) not in env vars. Access to share decryption requires operator action with audit logging. |
| **Key share loss (client-side)** | High | Medium | Recovery share (Share C) allows wallet restoration with email OTP verification. 2-of-3 threshold means server + recovery can restore. Recovery UX tested extensively. |
| **WebSocket latency under load** | Medium | Medium | Benchmarks: target <100ms per round under 1000 concurrent ceremonies. Connection pooling per wallet. Horizontal scaling of mpc-service with Redis pub/sub for cross-instance state. |
| **OAuth provider downtime** | Medium | Low | Multiple auth providers per sub-org (user can choose any). Fallback to email/passcode auth always available. Degraded mode messaging in SDK. |
| **VelumX relayer outage** | Medium | Low | Fallback to direct Stacks node broadcast (user pays own gas). SDK surfaces estimated fee when relayer is unavailable. |
| **JWT token theft via XSS** | High | Low | JWT stored in memory (not localStorage). Short TTL (15 min). Refresh tokens stored in httpOnly, same-site cookies on auth subdomain. CSP headers on iframe. |
| **Supply chain attack on npm packages** | Medium | Low | Lockfile committed (`pnpm-lock.yaml`). `pnpm audit` in CI. Minimal dependency footprint. SBOM generation for compliance. |

---

## 6. Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| **Auth conversion rate** | >85% | (Successful auths / auth attempts) across all providers |
| **Auth latency (p50)** | < 500ms | OAuth flow from button click to JWT delivered |
| **Auth latency (p99)** | < 2s | Includes worst-case OAuth provider response |
| **MPC DKG ceremony duration (p50)** | < 3s | WebSocket connection + 3 rounds of DKG |
| **MPC signing ceremony duration (p50)** | < 400ms | 4 rounds over established WebSocket |
| **MPC signing ceremony duration (p99)** | < 1.5s | Under concurrent load |
| **Wallet creation success rate** | >99.5% | (Successful DKG / DKG attempts) |
| **Signing success rate** | >99.9% | (Successful ceremonies / ceremony attempts) |
| **SDK integration time** | < 10 min | Measured from developer first running `npm install` to first successful auth |
| **API uptime (auth-service)** | 99.95% | Monthly, excluding planned maintenance |
| **API uptime (mpc-service)** | 99.95% | Monthly |
| **Developer NPS** | >50 | Quarterly survey of dashboard users |
| **End-user auth error rate** | < 1% | Failed auths due to Meluri infra (excluding user errors) |

### Proxy metrics for early validation (pre-launch):

- **Internal dogfooding:** 3 partner dApps using Meluri MPC in testnet before mainnet launch.
- **Test coverage:** >80% line coverage on auth module, >90% on TSS library.
- **Fuzz test hours:** >100 CPU-hours of fuzz testing on TSS signing and verification.
- **Audit findings:** Zero critical or high findings from external security review.

---

*Last updated: 2026-05-09*
