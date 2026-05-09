# Meluri MPC — Task Breakdown

> **Goal:** Build Meluri MPC, a Privy/Web3Auth competitor for the Stacks ecosystem — providing embedded wallet auth with multi-party computation (MPC) key management, wallet orchestration, and developer SDKs.

---

## Total Duration Estimate

| Phase | Duration |
|-------|----------|
| Phase 1: Auth Service | 6 weeks |
| Phase 2: MPC Service | 8 weeks |
| Phase 3: Wallet Orchestration | 3 weeks |
| Phase 4: SDK & Developer Experience | 2 weeks |
| Phase 5: Production Hardening | 2 weeks |
| **Total (serial)** | **21 weeks (~5 months)** |
| **Total (parallelised)** | **~16 weeks (~4 months)** |

---

## Dependency Graph

```
Phase 1 (Auth) ─────────────────────┐
     │                              │
     ├── Phase 4 (SDK/DX) ──────────┤
     │                              │
Phase 2 (MPC) ──────────────────────┤
     │                              │
     └── Phase 3 (Wallet) ──────────┤
                                    │
                              Phase 5 (Hardening)
```

| Dependency | Blocks | Can run parallel with |
|------------|--------|-----------------------|
| Phase 1 (Auth) | Phase 3, Phase 4 | Phase 2 |
| Phase 2 (MPC) | Phase 3, Phase 4 | Phase 1 |
| Phase 1 + Phase 2 | Phase 3 | — |
| Phase 1 + Phase 3 | Phase 4 | — |
| Phase 1 + Phase 2 + Phase 3 + Phase 4 | Phase 5 | — |

> **Recommendation:** Start Phase 1 and Phase 2 in parallel with two squads. Phase 3 begins after both are substantially complete. Phase 4 can soft-start once Phase 1 has a stable SDK surface. Phase 5 is gating-only and runs last.

---

## Phase 1: Auth Service (6 weeks)

### Task 1.1: OAuth2 Provider Integration (2 weeks)

- [ ] **Google OAuth (OIDC)** — `apps/api/src/auth/providers/google/` — 1 day
  - Implement OpenID Connect flow: redirect → code exchange → ID token validation
  - Map Google `sub` → internal user ID with collision-safe namespace prefix
  - Parse `email`, `name`, `picture` claims into Meluri user profile
  - Handle user linking when same email exists across providers
- [ ] **Apple OAuth (SIWA)** — `apps/api/src/auth/providers/apple/` — 1 day
  - Implement Sign In with Apple (SIWA): `authorization_code` grant type
  - Generate and validate client secret (ES256 JWT signed with Apple private key)
  - Handle Apple's one-time `user` identifier and email relay (`@privaterelay.appleid.com`)
  - Account for Apple's scoped `name` claim (only sent on first auth)
- [ ] **GitHub OAuth** — `apps/api/src/auth/providers/github/` — 0.5 day
  - Standard OAuth2 web application flow: `https://github.com/login/oauth/authorize`
  - Fetch primary email via `GET /user/emails` (email scope required)
  - Map GitHub user data: `id`, `login`, `avatar_url`, `name`
- [ ] **Discord OAuth** — `apps/api/src/auth/providers/discord/` — 0.5 day
  - OAuth2 with `identify` + `email` scopes
  - Fetch user via `GET /users/@me`
  - Map Discord data: `id`, `username`, `discriminator`, `avatar`, `email`
- [ ] **Twitter/X OAuth2** — `apps/api/src/auth/providers/twitter/` — 0.5 day
  - OAuth 2.0 Authorization Code with PKCE (Twitter requires PKCE)
  - Scopes: `users.read`, `tweet.read`
  - Fetch user via `GET /2/users/me` with `user.fields=profile_image_url`
  - Note: Twitter OAuth2 does not return email — prompt for email on first sign-in or use email-less account flow
- [ ] **Email/Password + Magic Link** — `apps/api/src/auth/providers/email/` — 2 days
  - Registration: email + password with bcrypt/argon2 hashing
  - Magic link: generate single-use, time-limited (15 min) opaque token sent via email
  - Verify existing account / new user path on magic link click
  - Email send integration (Resend / SendGrid / SES abstraction layer)
  - Password reset flow via email
- [ ] **Unified OAuth callback handler** — `apps/api/src/auth/callback/` — 1 day
  - Single `GET /auth/callback/:provider` endpoint that dispatches to provider strategies
  - Normalized redirect: on success → redirect to developer's registered `redirect_uri` with `?token=...`
  - Error handling: redirect with `?error=...` and human-readable message
  - CSRF protection: `state` parameter round-trip validation (stored in Redis, TTL 10 min)
- [ ] **Provider config via env vars** — `apps/api/src/auth/config/` — 0.5 day
  - Per-provider env schema: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, etc.
  - Zod validation on startup — fail fast with clear message if a configured provider is missing required vars
  - Support `AUTH_ENABLED_PROVIDERS` comma-separated list to toggle providers on/off
- [ ] **Integration tests per provider** — `apps/api/test/auth/` — 2 days
  - Mock OAuth server simulating each provider's token and user-info endpoints
  - Test happy path: register, link, re-auth
  - Test error paths: invalid token, expired token, mismatched state, denied consent
  - Test provider toggle: disabled provider returns 404

### Task 1.2: JWT & Session Management (1 week)

- [ ] **JWT issuance (access + refresh tokens)** — `apps/api/src/auth/jwt/` — 1 day
  - Access token: short-lived (15 min), RS256 signed, contains `sub`, `iat`, `exp`, `iss`, `aud`
  - Refresh token: long-lived (30 days), opaque UUID reference stored in Redis
  - Token payload includes `tenant_id` for multi-tenant isolation
  - Issue both tokens on successful OAuth callback / magic link verification
- [ ] **Refresh token rotation & blacklisting** — `apps/api/src/auth/refresh/` — 1 day
  - On refresh: invalidate the used refresh token, issue new refresh + access pair
  - Detect refresh token reuse → revoke entire refresh token family (indicating token theft)
  - Redis-backed blacklist: `banned:refresh_family:<familyId>` with TTL matching token lifetime
- [ ] **Session store (Redis)** — `apps/api/src/session/` — 1 day
  - Session keyed by `session:<sessionId>` with fields: `userId`, `tenantId`, `provider`, `createdAt`, `lastSeen`, `userAgent`, `ip`
  - TTL matches access token lifetime + grace period
  - `GET /sessions` for user to list active sessions
  - `DELETE /sessions/:id` for user to revoke specific sessions
- [ ] **JWKS endpoint for SDK verification** — `apps/api/src/auth/jwks/` — 1 day
  - `GET /.well-known/jwks.json` — public keys for RS256 token verification
  - Key rotation support: maintain 2 key pairs (current + next), rotate on schedule
  - SDK calls this endpoint on init to cache public keys
- [ ] **Session expiry & logout** — `apps/api/src/auth/logout/` — 0.5 day
  - `POST /logout` — invalidate access token, refresh token, and session record
  - Clear Redis entries; blacklist access token JTI until natural expiry
  - SDK clears local state; iframe posts `meluri:logout` message
- [ ] **Rate limiting on auth endpoints** — `apps/api/src/auth/rate-limit/` — 0.5 day
  - Per-IP rate limit on `/auth/login`, `/auth/callback`, `/auth/register` (e.g., 10 req/min)
  - Per-IP rate limit on `/auth/refresh` (30 req/min — higher, since SDK auto-refreshes)
  - Use Redis-backed sliding window via `@nestjs/throttler` or a custom guard

### Task 1.3: Multi-Tenant Developer Auth (1 week)

- [ ] **Developer registration & API key generation** — `apps/api/src/developers/` — 1 day
  - `POST /developers/register` — email + password → creates developer account
  - `POST /developers/api-keys` — creates a new API key for the developer
  - API key format: `meluri_live_Sgx...4Fk` (prefix `meluri_live_` + 32-byte random)
  - Return full key only once at creation time; subsequent requests show prefix + last 4 chars
  - Key scoping: `read`, `read+write`, or `admin` (future: scope to specific wallet operations)
- [ ] **API key hashing (SHA256 + prefix)** — `apps/api/src/developers/hashing/` — 0.5 day
  - Store `SHA256(apiKey)` in DB, never store raw key
  - Prefix `meluri_live_` / `meluri_test_` used for quick lookup (first 12 chars stored in separate indexed column)
  - Constant-time comparison for key validation
  - Test key prefix: `meluri_test_` (valid only in development mode, lower rate limits)
- [ ] **Developer domain allowlist validation** — `apps/api/src/developers/domains/` — 1 day
  - Developer registers allowed origin domains in dashboard: `https://myapp.com`, `http://localhost:3000`
  - On SDK init, SDK sends `origin` → server validates against allowlist
  - CORS headers dynamically set per-request based on validated origin
  - Wildcard subdomain support: `*.myapp.com` matches `app.myapp.com`, `dashboard.myapp.com`
- [ ] **Per-developer user isolation** — `apps/api/src/developers/isolation/` — 1 day
  - Users scoped per `tenant_id` (developer account ID)
  - Same user authenticating via two different apps gets two separate user records
  - DB queries always filter by `tenant_id` via middleware/guard, never rely on caller to pass it
  - Migration to add `tenant_id` FK to users, sessions, wallets tables
- [ ] **CORS middleware per developer domain** — `apps/api/src/middleware/cors/` — 1 day
  - Dynamic CORS: read `Origin` header → lookup in developer domain allowlist → set `Access-Control-Allow-Origin`
  - Preflight (`OPTIONS`) handling: return allowed methods, headers, credentials
  - Reject origins not in any developer's allowlist with `403 Forbidden`
  - Cache validated origins in Redis (TTL 5 min) to avoid DB hit on every request
- [ ] **Developer portal sign-up UI** — `apps/dashboard/src/` — 2 days
  - Registration page: email + password + app name
  - Dashboard: view API keys, rotate key, manage domain allowlist
  - Usage analytics (basic): API call count, active users, auth method breakdown
  - Copy-to-clipboard for API key, code snippet generator (React, Next.js, Vanilla JS)

### Task 1.4: SDK Integration (1 week)

- [ ] **MeluriAuth React hook (`useMeluriAuth`)** — `packages/sdk/src/react/` — 2 days
  - `const { login, logout, user, isReady, isAuthenticated, getAccessToken } = useMeluriAuth()`
  - Auto-refresh access token in background (10 min interval + on focus)
  - Session persistence in `localStorage` / `sessionStorage` (configurable)
  - Expose `MeluriAuthProvider` context provider wrapping `MeluriAuthContext`
  - Handle reconnection: if SDK loaded with valid refresh token cookie, restore session silently
- [ ] **Embedded auth modal (iframe/postMessage)** — `packages/sdk/src/modal/` — 2 days
  - Iframe pointing to `https://auth.meluri.io/embed` with `?tenant_id=...&redirect_uri=...`
  - `postMessage` protocol: `{ type: 'meluri:auth_success', payload: { user, accessToken } }`
  - SDK listens on `window` for `meluri:auth_success` → processes and closes modal
  - Modal UI: brandable accent color + logo via query params (`?theme=#4F46E5&logo=https://...`)
  - Social provider buttons: Google, Apple, GitHub, Discord, Twitter, Email
  - Error states: network failure, provider denied, timeout
- [ ] **`meluri.login()` — opens modal, returns session** — `packages/sdk/src/core/` — 1 day
  - Builds auth URL with required query params (tenant_id, redirect_uri, provider)
  - Opens centered popup or full-screen modal based on device (mobile = full-screen)
  - Resolves promise with `{ user, accessToken }` on success
  - Rejects with typed error on failure / user dismissal
  - Timeout after 5 minutes (user left modal open)
- [ ] **`meluri.logout()` — clears session** — `packages/sdk/src/core/` — 0.5 day
  - Calls `POST /auth/logout` to invalidate server session
  - Clears local storage: access token, refresh token, user data
  - Dispatches `meluri:logout` event for app-level cleanup
  - If iframe is embedded, posts `meluri:logout` message so iframe clears its state
- [ ] **CDN bundle for headless HTML integration** — `packages/sdk/dist/cdn/` — 1 day
  - IIFE build output: `meluri-sdk.iife.js`
  - Expose `window.Meluri` global with same API surface as NPM package
  - Serve via CDN (Cloudflare R2 + CDN or jsDelivr for OSS)
  - Source map included for debugging
  - Versioned URL: `https://cdn.meluri.io/sdk/v1/meluri-sdk.iife.js`
- [ ] **Documentation & examples** — `packages/sdk/README.md` + `apps/demo/` — 0.5 day
  - README: quick start, API reference, configuration options, troubleshooting
  - Demo app in `apps/demo/`: React app showing login → wallet connection → sign message → sign transaction
  - CodeSandbox-ready example for each framework (React, Next.js pages, Next.js app dir, Vanilla)

### Task 1.5: Auth Service Infrastructure (1 week)

- [ ] **Docker container for auth service** — `apps/api/Dockerfile` — 1 day
  - Multi-stage build: `pnpm install --prod` → dist → production image
  - Node 20-alpine base, non-root user
  - Health check endpoint baked in
  - `.dockerignore` excludes `node_modules`, `.env`, `test/`, `prisma/`
- [ ] **Health check + graceful shutdown** — `apps/api/src/health/` — 0.5 day
  - `GET /health` — returns 200 if DB + Redis are reachable
  - `GET /health/ready` — returns 200 if service is accepting traffic (readiness probe)
  - Graceful shutdown: on SIGTERM, stop accepting new requests, drain in-flight requests (30s timeout), disconnect DB + Redis
- [ ] **Structured JSON logging** — `apps/api/src/logging/` — 0.5 day
  - Use `pino` or `winston` with JSON format
  - Log levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
  - Every request gets a `requestId` (correlation ID) attached to all logs in that context
  - Redact sensitive fields: tokens, passwords, API keys from log output
- [ ] **Prometheus metrics** — `apps/api/src/metrics/` — 1 day
  - `GET /metrics` endpoint (Prometheus scrape target)
  - Counters: `auth_login_total{provider}`, `auth_login_errors_total{provider,error}`, `api_requests_total{method,path,status}`
  - Histograms: `auth_login_duration_seconds{provider}`, `api_request_duration_seconds{method,path}`
  - Gauges: `active_sessions`, `db_pool_connections`
  - Use `prom-client` library or `@willsoto/nestjs-prometheus`
- [ ] **Auth DB schema finalization** — `apps/api/prisma/schema.prisma` — 1 day
  - Tables: `User`, `UserProvider` (linked OAuth accounts), `Session`, `RefreshToken`, `RefreshTokenFamily`, `Developer`, `ApiKey`, `Domain`
  - Indexes: `User(email, tenantId)` UNIQUE, `RefreshToken(tokenHash)`, `Session(userId)`, `ApiKey(prefixHash)`
  - Soft deletes vs hard deletes decision: users get soft-deleted (GDPR right-to-delete = hard delete after 30-day grace)
  - Audit columns: `createdAt`, `updatedAt`, `deletedAt`
- [ ] **Migration scripts** — `apps/api/prisma/migrations/` — 1 day
  - Initial migration: all tables with foreign keys and indexes
  - Seed script: create a test developer, a test API key, domains for localhost
  - Migration run as part of CI and Docker entrypoint (`prisma migrate deploy`)
  - Rollback strategy: never auto-rollback in production; only forward migrations
- [ ] **Local dev setup (docker-compose)** — `docker-compose.yml` — 1 day
  - Services: postgres (port 5434), redis (port 6381)
  - `pnpm dev` starts NestJS API with hot reload
  - `pnpm db:studio` opens Prisma Studio on port 5555
  - `.env.example` with all required vars documented with comments
  - One-command setup: `pnpm install && pnpm db:migrate && pnpm dev`

---

## Phase 2: MPC Service (8 weeks)

### Task 2.1: TSS Core (3 weeks)

- [ ] **Research & select TSS library (GG18 vs GG20 vs FROST)** — `docs/adr/` — 2 days
  - Evaluate candidates: `multi-party-sig` (ZenGo), `tss-lib` (Binance/bnb-chain), `frost` (Zcash Foundation), `dfns/sdk` (inspiration only)
  - Criteria: secp256k1 support (Stacks), audit history, language (Rust vs Go vs TypeScript with WASM), license, maintenance activity
  - **Decision:** Write ADR (Architecture Decision Record) documenting selection with trade-offs
  - If no suitable TS-native lib exists, plan Rust/WASM wrapper or Go sidecar
  - Spike: implement a single keygen + sign round-trip with chosen library
- [ ] **Implement DKG 2-of-3** — `apps/mpc/src/dkg/` — 4 days
  - Distributed Key Generation: 3 parties perform multi-round protocol to jointly produce a public key + 3 private key shares
  - No single party ever holds the full private key at any point
  - Implement round-based state machine: Round1 → Round2 → Round3 → Done
  - Each round broadcasts to peers + stores received messages
  - Byzantine fault tolerance: 2-of-3 threshold means 1 dishonest party cannot forge signatures or learn the key
  - Test vectors: known DKG transcript → verify resulting public key matches expected
- [ ] **Key share serialization & storage** — `apps/mpc/src/storage/` — 1 day
  - Serialize key shares as encrypted blobs: AES-256-GCM with per-share encryption key
  - Storage: PostgreSQL `key_shares` table with columns `id`, `wallet_id`, `party_index`, `share_blob`, `created_at`, `version`
  - Party index (0, 1, 2) determines which MPC node stores which share
  - Share encryption key stored in HSM or cloud KMS (AWS KMS / GCP KMS), never in plaintext config
  - Optional: allow developers to bring their own share storage (webhook to external KMS)
- [ ] **TSS Signing protocol (2-of-3)** — `apps/mpc/src/signing/` — 4 days
  - 2-of-3 threshold signing: any 2 parties can produce a valid signature
  - Round-based: SignRound1 (each party computes partial) → SignRound2 (combine partials) → Signature
  - Message must be pre-hashed (e.g., SHA-256 of the Stacks transaction) — sign the hash, not raw bytes
  - Party selection: coordinator picks 2 available parties based on health/latency
  - Timeout handling: if a party goes silent during signing, retry with the third party (failover within 30s)
- [ ] **ECDSA sign for Stacks/secp256k1** — `apps/mpc/src/signing/ecdsa/` — 3 days
  - Stacks uses secp256k1 curve (same as Bitcoin/Ethereum)
  - Implement ECDSA over secp256k1 with the chosen TSS library
  - Verify signatures against `@noble/secp256k1` or `@stacks/transactions`
  - Test: sign a Stacks transaction → broadcast via Hiro API → verify on-chain
  - Handle Stacks-specific sighash types and transaction serialization
- [ ] **Multi-chain support prep (EdDSA)** — `apps/mpc/src/signing/eddsa/` — 1 day
  - Abstract signing interface: `sign(walletId, chain, message) => { r, s, v }` or `{ signature, publicKey }`
  - EdDSA (Ed25519) for future Solana/Sui/Aptos support
  - Implement Ed25519 keygen + sign as a second curve alongside secp256k1
  - Chain registry config: `chains.stacks.curve = 'secp256k1'`, `chains.solana.curve = 'ed25519'`
- [ ] **TSS protocol unit tests** — `apps/mpc/test/dkg/`, `apps/mpc/test/signing/` — 2 days
  - In-process 3-party simulation (all parties in one test process using channels/queues)
  - Test: DKG succeeds with honest parties
  - Test: Signing succeeds with any 2-of-3 combination
  - Test: DKG fails if fewer than 2 parties complete (not enough shares)
  - Test: signing fails if only 1 party participates (below threshold)
  - Test: malicious share injection is detected
- [ ] **Round-trip test: DKG → sign → verify** — `apps/mpc/test/round-trip/` — 2 days
  - End-to-end: generate 3 shares via DKG → sign a test message with 2 shares → verify signature with public key
  - Verify signature using both the TSS library's verify function AND `@noble/secp256k1.verify`
  - Test with multiple random messages (100 messages) to catch non-deterministic bugs
  - Measure latency: target < 2s for DKG, < 500ms for signing (excl. network round-trips)
- [ ] **WebSocket protocol for share comms** — `apps/mpc/src/transport/` — 4 days
  - WebSocket server per MPC node for peer-to-peer communication
  - Protocol messages: `DKG_ROUND_1`, `DKG_ROUND_2`, `DKG_ROUND_3`, `SIGN_ROUND_1`, `SIGN_ROUND_2`, `ABORT`, `HEARTBEAT`
  - Binary encoding: MessagePack or Protocol Buffers for efficient wire format
  - Reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
  - Message ordering guarantee per session (TCP/WS already ordered, but verify at app layer)
  - Encryption: TLS for transport, plus AES-GCM for message payload (defense in depth)
  - Connection health: heartbeat every 5s, mark peer as unhealthy after 3 missed heartbeats

### Task 2.2: Key Share Distribution (1.5 weeks)

- [ ] **MPC node deployment topology** — `apps/mpc/src/topology/` — 1 day
  - Define 3-node cluster: `mpc-node-0`, `mpc-node-1`, `mpc-node-2`
  - Each node runs in a separate availability zone / region for physical separation
  - Node discovery: static config (`MPC_PEERS=ws://mpc-node-1:8080,ws://mpc-node-2:8080`) OR dynamic via Consul/etcd
  - Node identity: each node has a TLS certificate + Ed25519 keypair for peer authentication
- [ ] **Share encryption & KMS integration** — `apps/mpc/src/kms/` — 2 days
  - Share encryption at rest: AES-256-GCM with key from KMS
  - KMS abstraction layer: `encryptShare(plaintext) => ciphertext`, `decryptShare(ciphertext) => plaintext`
  - AWS KMS implementation: use CMK with automatic key rotation
  - GCP KMS implementation: use symmetric key with rotation schedule
  - Local dev: file-based key (for development only, gated by `NODE_ENV=development`)
  - Key access audit logging: every KMS decrypt call is logged for security monitoring
- [ ] **Share backup & recovery bootstrapping** — `apps/mpc/src/recovery/` — 2 days
  - On wallet creation, generate a recovery key (AES-256) shown to user ONCE
  - Encrypt all 3 key shares with recovery key → store encrypted bundle in `key_shares` table with `recovery_bundle` column
  - Recovery flow: user provides recovery key → decrypt bundle → redistribute to MPC nodes
  - Recovery key derivation: `PBKDF2(recoveryPhrase, salt, iterations=600000)` → AES key
  - UI for recovery: 12-word mnemonic (BIP39) display, user confirms by re-entering 3 random words
- [ ] **Share sync between nodes on startup** — `apps/mpc/src/sync/` — 1 day
  - On node startup: connect to peers → request missing shares for known wallets
  - Gossip protocol for new wallet shares: when DKG completes, each node broadcasts its share to peers
  - Consistency check: each node periodically verifies it holds expected shares for all wallets in its partition
  - Missing share detection: if a node has share index N but peer doesn't, trigger re-share

### Task 2.3: Signing Ceremony (1.5 weeks)

- [ ] **Signing request validation & auth** — `apps/mpc/src/signing/validation/` — 1 day
  - Incoming signing request must include: `walletId`, `message` (transaction hash), `chain`, valid API key
  - Rate limit: per-wallet signing quota (e.g., 10 req/min, configurable per developer tier)
  - Validate wallet belongs to the requesting developer's tenant
  - Validate chain is supported for the wallet
  - Reject duplicate requests (idempotency key) within 5-minute window
- [ ] **Party selection & coordination** — `apps/mpc/src/signing/coordinator/` — 2 days
  - Coordinator (the node receiving the API request) selects 2-of-3 available parties
  - Selection criteria: node health (latency < 100ms, heartbeat alive), load (in-flight signing count), geographic proximity
  - Coordinator initiates signing protocol via WebSocket messages to selected parties
  - If a selected party fails mid-signing, coordinator can fallback to the third party (requires fresh round restart)
  - Timeout: entire signing ceremony times out after 30s → return `503` to caller
- [ ] **Transaction simulation & preview** — `apps/mpc/src/signing/preview/` — 1 day
  - Before signing, simulate the transaction against a Stacks node (dry-run)
  - Return preview to user showing: `to`, `amount`, `fee`, `estimatedCost`, `postCondition`
  - User confirms in wallet UI before the actual signing ceremony begins
  - Reject if simulation fails (invalid nonce, insufficient balance, etc.)
- [ ] **Signing audit log** — `apps/mpc/src/signing/audit/` — 1 day
  - Log every signing request: `walletId`, `developerId`, `chain`, `messageHash`, `timestamp`, `partyIds`, `success`, `error`
  - Immutable append-only log (PostgreSQL table with no UPDATE/DELETE permissions for app role)
  - Webhook: developer can register a URL to receive signing event notifications
  - Dashboard: view signing history per wallet with search and filters
- [ ] **Concurrent signing support** — `apps/mpc/src/signing/concurrency/` — 1 day
  - Multiple signing ceremonies can run in parallel for different wallets
  - Mutex per wallet: only one active signing ceremony per wallet at a time (prevent nonce reuse)
  - Queue for same-wallet requests: FIFO, max queue depth = 10
  - Graceful handling when queue is full: return `429 Too Many Requests`

### Task 2.4: MPC Service Infrastructure (1 week)

- [ ] **Docker container for MPC service** — `apps/mpc/Dockerfile` — 1 day
  - Multi-stage build, Node 20-alpine, non-root user
  - If using Rust/WASM: include Rust toolchain in build stage, compile to WASM, copy to runtime
  - Health check: WebSocket connectivity to peers + DB connectivity
  - Resource limits: CPU 2, Memory 2Gi, configured in compose/K8s
- [ ] **gRPC API for signing requests** — `apps/mpc/src/grpc/` — 1 day
  - Proto definition: `SigningService.Sign(SignRequest) => SignResponse`
  - gRPC for internal service-to-service communication (auth service → MPC service)
  - REST gateway alongside gRPC for external API consumers (developers)
  - TLS termination at API gateway, mTLS between services
- [ ] **Prometheus metrics for MPC** — `apps/mpc/src/metrics/` — 0.5 day
  - Counters: `mpc_dkg_total`, `mpc_dkg_errors_total`, `mpc_signing_total{chain}`, `mpc_signing_errors_total{chain,error}`, `mpc_peer_disconnects_total`
  - Histograms: `mpc_dkg_duration_seconds`, `mpc_signing_duration_seconds{chain}`, `mpc_websocket_message_latency_seconds`
  - Gauges: `mpc_active_ceremonies`, `mpc_peer_connections`, `mpc_wallet_shares_count`
- [ ] **Load testing** — `apps/mpc/test/load/` — 1.5 days
  - Simulate 100 concurrent DKG ceremonies, 1000 concurrent signing requests
  - Measure: p50, p95, p99 latency; throughput (requests/sec); error rate
  - Identify bottlenecks: WebSocket message throughput, DB queries, CPU
  - Load test report with findings and recommendations
- [ ] **Failure injection testing (Chaos)** — `apps/mpc/test/chaos/` — 1 day
  - Kill one MPC node mid-DKG → verify ceremony fails gracefully with clear error
  - Kill one MPC node mid-signing → verify coordinator failover to third party
  - Network partition: isolate one node → verify it's detected unhealthy, signing continues with remaining 2
  - DB outage → verify graceful degradation (no crash, return 503)

### Task 2.5: Key Recovery (1 week)

- [ ] **Social recovery flow** — `apps/mpc/src/recovery/social/` — 2 days
  - User designates 3-5 guardians (email addresses or wallet addresses)
  - Recovery threshold: M-of-N guardians must approve (e.g., 3-of-5)
  - Guardian approval: email with unique one-time link → clicks to approve → MPC nodes reconstruct key shares for user
  - Time-lock: recovery request has a 48-hour delay before execution (user can cancel)
  - Cancel recovery: if user still has access to any auth method, they can cancel pending recovery
- [ ] **Recovery key (BIP39 mnemonic) integration** — `apps/mpc/src/recovery/mnemonic/` — 1.5 days
  - Generate 12-word BIP39 mnemonic on wallet creation
  - Display once: full-screen modal with "I have saved my recovery phrase" confirmation
  - Verify: prompt user to enter words 3, 7, and 11 before proceeding
  - Mnemonic → seed via PBKDF2 → AES key → encrypt all share material
  - Recovery UI: paste 12 words → decrypt shares → redistribute to MPC nodes → wallet restored
- [ ] **Server-side recovery (developer-managed)** — `apps/mpc/src/recovery/server/` — 1 day
  - Option for developers to manage recovery themselves
  - Instead of user-facing mnemonic, MPC nodes send encrypted share bundle to developer's webhook
  - Developer stores it in their own infrastructure
  - Recovery: developer calls `POST /wallets/:id/recover` with encrypted bundle → MPC nodes import shares
  - Trade-off: developer takes on recovery custody burden; simpler UX for end users
- [ ] **Recovery testing & drills** — `apps/mpc/test/recovery/` — 1.5 days
  - Create wallet via DKG → simulate total loss (delete all shares) → recover via mnemonic → verify same public key
  - Create wallet → social recovery with 3-of-5 guardians → verify 3 approvals recovers wallet
  - Test edge cases: wrong mnemonic → clear error; insufficient guardians → recovery rejected; expired recovery request → rejected
  - Automated recovery drill script that runs in CI nightly

---

## Phase 3: Wallet Orchestration (3 weeks)

### Task 3.1: External Wallet Connection (1 week)

- [ ] **Stacks wallet connector abstraction** — `packages/sdk/src/wallets/` — 1.5 days
  - Unified interface: `connect(provider) => { address, publicKey, signMessage, signTransaction, signStructuredData }`
  - Implement connector plugins: Leather (Hiro), Xverse, Asigna
  - Each connector handles provider-specific API: `window.LeatherProvider`, `window.XverseProvider`, `window.AsignaProvider`
  - Provider detection: scan `window` for injected providers, rank by user preference config
  - Event subscription: `accountsChanged`, `networkChanged` — propagate to app via callbacks
- [ ] **Wallet discovery modal** — `packages/sdk/src/wallets/discovery/` — 1.5 days
  - Modal listing detected wallet extensions with icons
  - "Install" link for wallets not detected (opens Chrome Web Store / extension website)
  - Chain filtering: only show wallets that support the requested chain (default: Stacks)
  - "Remember my choice" toggle (stores preference in localStorage)
  - Accessible: keyboard navigation, screen reader labels, focus trap
- [ ] **Sign message & structured data** — `packages/sdk/src/wallets/signing/` — 1 day
  - `signMessage(message: string)` — standard ECDSA sign with personal message prefix (BIP-191)
  - `signStructuredData(domain, types, message)` — EIP-712 style for Stacks structured data
  - Return signature in format compatible with `@stacks/transactions`
  - Verify signature client-side before returning to app
- [ ] **Network switching** — `packages/sdk/src/wallets/network/` — 1 day
  - Detect current network from wallet provider (mainnet, testnet, devnet, mocknet)
  - `switchNetwork(network)` — request wallet to switch chains
  - Fallback for wallets that don't support programmatic switching: show instructions
  - Network mismatch warning: if app expects testnet but wallet is on mainnet, warn user
- [ ] **Connection persistence & reconnection** — `packages/sdk/src/wallets/persistence/` — 1 day
  - Save last connected wallet provider + address in localStorage
  - On page load, auto-reconnect to last used wallet
  - Handle cases where provider is no longer available (uninstalled) → prompt reconnect
  - Auto-reconnect is opt-in via `autoConnect: true` in config

### Task 3.2: Programmable Wallet (1 week)

- [ ] **Embedded wallet creation** — `apps/api/src/wallets/` — 1.5 days
  - `POST /wallets` — creates a new MPC wallet for the authenticated user
  - Returns `walletId`, `address`, `publicKey` (no private key material returned to client)
  - Triggers DKG ceremony across MPC nodes (async — return `202 Accepted` with status polling URL)
  - Wallet naming: optional `label` field, auto-generate if not provided (`Wallet 1`, `Wallet 2`)
  - One user can have multiple wallets (e.g., dev wallet, savings wallet)
- [ ] **Wallet lifecycle management** — `apps/api/src/wallets/` — 1 day
  - `GET /wallets` — list all wallets for current user
  - `GET /wallets/:id` — get wallet details + balance + recent activity
  - `PATCH /wallets/:id` — update label
  - `DELETE /wallets/:id` — soft-delete wallet (requires 7-day cooldown before hard delete)
  - `POST /wallets/:id/export` — retrieve encrypted share bundle (for recovery self-custody)
- [ ] **Transaction building & signing** — `apps/api/src/wallets/transactions/` — 2 days
  - `POST /wallets/:id/transactions` — build + sign + broadcast
  - Request body: `{ to, amount, memo?, fee?, nonce? }` or raw `{ tx: hex }`
  - Stacks transaction construction using `@stacks/transactions`
  - Fee estimation: query Hiro API for current fee rates, add 10% buffer
  - Nonce management: track on-chain nonce in `wallets` table, handle pending nonces
  - Return: `{ txId, rawTx, status: 'pending' }` with polling URL for confirmation
- [ ] **Multi-chain transaction abstraction** — `apps/api/src/wallets/multi-chain/` — 1 day
  - Abstract transaction interface: `buildTx(wallet, params)`, `estimateFee(wallet, tx)`, `broadcastTx(wallet, signedTx)`
  - Stacks implementation as first adapter
  - Future adapters slot in: Ethereum (viem), Solana (@solana/web3.js), Bitcoin (bitcoinjs-lib)
  - Chain-specific configuration: RPC URLs, explorer URLs, token decimals
- [ ] **Transaction history & indexing** — `apps/api/src/wallets/history/` — 1 day
  - `GET /wallets/:id/transactions` — paginated transaction history
  - Source from Stacks API / Hiro indexer
  - Cache recent transactions in local DB for fast access
  - Include: `txId`, `type` (transfer/contract-call/deploy), `from`, `to`, `amount`, `fee`, `status`, `blockHeight`, `timestamp`
  - WebSocket subscription: `wss://api.meluri.io/wallets/:id/transactions/stream` for real-time updates

### Task 3.3: Wallet UI Kit (1 week)

- [ ] **React wallet components** — `packages/sdk/src/ui/` — 2 days
  - `<WalletButton />` — shows connected address or "Connect Wallet" CTA
  - `<WalletModal />` — full wallet management modal: balances, send, receive, history
  - `<SendForm />` — address input, amount input, memo, fee selector, send button with loading state
  - `<TransactionList />` — scrollable transaction history with status badges
  - `<NetworkBadge />` — shows current network with color coding (mainnet=green, testnet=orange)
  - Theming: CSS custom properties for all colors, spacing, fonts; ships with light + dark themes
- [ ] **Headless wallet hooks** — `packages/sdk/src/ui/hooks/` — 1.5 days
  - `useBalance(address)` — reactive balance hook with auto-polling (10s interval)
  - `useTransactions(walletId)` — paginated transaction history with infinite scroll support
  - `useSendTransaction()` — returns `{ send, isLoading, error, txId }`
  - `useWallet()` — returns `{ wallet, balance, transactions, send, isLoading, error }` (convenience hook)
  - All hooks accept optional `refreshInterval` and `onError` callback
- [ ] **QR code & deep link support** — `packages/sdk/src/ui/qr/` — 1 day
  - `<QRCode address={address} />` — display receive address as QR code
  - Deep link generation: `stacks://wallet.meluri.io/send?to=SP...&amount=1000000` for mobile wallets
  - Copy address button with "Copied!" feedback toast
- [ ] **Accessibility & responsive design** — `packages/sdk/src/ui/a11y/` — 1 day
  - WCAG 2.1 AA compliance: focus indicators, color contrast (4.5:1 min), screen reader labels
  - Keyboard navigation: Enter/Space to activate, Escape to close modals, Tab to navigate
  - Mobile responsive: modals become full-screen sheets, touch-friendly tap targets (44px min)
  - Reduced motion: respect `prefers-reduced-motion`, disable animations
- [ ] **UI component tests** — `packages/sdk/test/ui/` — 0.5 day
  - Render tests with React Testing Library
  - Interaction tests: click connect → modal opens → click provider → resolves
  - Snapshot tests for key components to catch unintended visual regressions
  - Mock wallet providers for deterministic test environment

---

## Phase 4: SDK & Developer Experience (2 weeks)

### Task 4.1: SDK Packaging (1 week)

- [ ] **Monorepo package structure** — `packages/sdk/` — 0.5 day
  - Entry points: `@meluri/sdk` (main), `@meluri/sdk/react`, `@meluri/sdk/wallets`, `@meluri/sdk/ui`
  - `exports` field in `package.json` for proper subpath exports (`@meluri/sdk/react`, etc.)
  - TypeScript declarations: emit `.d.ts` files alongside `.js` output
  - Tree-shaking: ensure individual imports don't pull in entire library (ESM with `sideEffects: false`)
- [ ] **Build configuration** — `packages/sdk/tsup.config.ts` — 1 day
  - Bundler: tsup (esbuild-based, fast builds)
  - Output formats: ESM (`.mjs`), CJS (`.cjs`), IIFE (`.iife.js` for CDN)
  - Minification: Terser for IIFE, esbuild for ESM/CJS (preserve class/function names for debugging)
  - Source maps: inline for dev, external `.map` files for production
  - Bundle size budget: < 50 KB gzipped for core, < 100 KB with UI components
- [ ] **NPM publishing pipeline** — `.github/workflows/publish-sdk.yml` — 1 day
  - On tag `sdk-v*.*.*`: build + test + publish to NPM
  - Provenance: generate SLSA provenance with `--provenance` flag
  - Canary releases: every merge to `main` publishes `0.0.0-canary.<sha>` for testing
  - Version bump: automated via `changesets` or `semantic-release`
  - `CHANGELOG.md` auto-generated from conventional commits
- [ ] **CDN distribution** — `packages/sdk/dist/cdn/` — 1 day
  - Upload IIFE bundle to Cloudflare R2 on release
  - Cache headers: `Cache-Control: public, max-age=31536000, immutable` (versioned URL)
  - CDN invalidation on new release (or use versioned paths to avoid invalidation)
  - Subresource Integrity (SRI) hash published in docs for `<script integrity="...">`
- [ ] **React Native support** — `packages/sdk/src/native/` — 1 day
  - React Native-compatible build (no DOM APIs)
  - Native OAuth flow: open `react-native-inappbrowser` or `expo-web-browser` for auth
  - AsyncStorage for session persistence instead of localStorage
  - Crypto polyfill: `react-native-quick-crypto` or `expo-crypto` for random bytes
  - Test on iOS simulator + Android emulator
- [ ] **Versioning strategy & backward compatibility** — `packages/sdk/VERSIONING.md` — 0.5 day
  - Semantic versioning: MAJOR.MINOR.PATCH
  - Breaking changes: bump MAJOR, provide migration guide
  - API deprecation: mark as `@deprecated` in TS, log console warning on use, remove in next MAJOR
  - Minimum supported versions: document which SDK versions are compatible with which API versions
  - Long-term support: maintain last 2 MAJOR versions with critical security patches

### Task 4.2: Documentation & Examples (1 week)

- [ ] **API reference documentation** — `docs/api/` — 2 days
  - OpenAPI 3.1 spec for all REST endpoints (`apps/api/openapi.yaml`)
  - Generated docs via Scalar or Redocly, hosted at `docs.meluri.io/api`
  - Request/response examples for every endpoint
  - Authentication guide: API key header, rate limits, error codes
  - Interactive "Try it" playground
- [ ] **SDK documentation** — `docs/sdk/` — 1.5 days
  - Getting started: install, initialize, first login — in under 5 minutes
  - Framework-specific guides: React, Next.js (pages router), Next.js (app router), Vanilla JS, React Native
  - API reference: every function, hook, component, and type documented
  - Migration guides: v0.x → v1.x, breaking changes explained
  - Troubleshooting section: common errors and solutions
- [ ] **Example applications** — `examples/` — 1.5 days
  - `examples/nextjs-pages/` — Full Next.js pages-router app with auth + wallet
  - `examples/nextjs-app/` — Next.js app-router with React Server Components + client components
  - `examples/vite-react/` — Minimal Vite + React app
  - `examples/vanilla-html/` — Single HTML file using CDN script (zero build tools)
  - `examples/react-native/` — Expo + React Native app
  - Each example: install deps → set env vars → run — documented in example's README
- [ ] **Stacks-specific integration guides** — `docs/guides/` — 1 day
  - "Sign a Stacks Transaction" — full walkthrough with code
  - "Call a Clarity Smart Contract" — using `@stacks/transactions` + Meluri SDK
  - "Deploy a Smart Contract" — contract deployment via Meluri wallet
  - "STX Transfer" — simple token transfer
  - "SIP-009 NFT Transfer" — NFT-specific guide
  - "SIP-010 FT Transfer" — fungible token guide
- [ ] **Developer portal polish** — `apps/dashboard/` — 0.5 day
  - Analytics dashboard: API usage graphs (requests/day, active users, auth method breakdown)
  - Quick start wizard: 3 steps → create app → get API key → copy snippet
  - Team management: invite team members to developer account (future scope, stub UI)
  - Billing: usage tier display, upgrade CTA (future scope, stub UI)

---

## Phase 5: Production Hardening (2 weeks)

### Task 5.1: Security (1 week)

- [ ] **External security audit** — `docs/security/` — 3 days (procurement + coordination, audit runs in parallel)
  - Scope: Auth service (OAuth flows, JWT, session mgmt), MPC service (TSS protocol, key storage, share transport), API (authn/authz, rate limiting, input validation)
  - Engage a reputable Web3 security firm (Trail of Bits, Halborn, Zellic, Ottersec)
  - Produce audit report → triage findings → create remediation tickets
  - Critical/High findings must be resolved before production launch
  - Publish audit report publicly (transparency — table stakes for MPC custody)
- [ ] **Penetration testing** — `docs/security/pentest/` — 2 days
  - Internal pen test targeting all public-facing endpoints
  - OWASP Top 10 checklist: injection, broken auth, sensitive data exposure, XXE, broken access control, security misconfig, XSS, insecure deserialization, vulnerable components, insufficient logging
  - Fuzzing: send malformed inputs to all API endpoints, verify graceful error handling
  - Rate limit bypass attempts: distributed requests across IPs, header spoofing
- [ ] **Dependency vulnerability scanning** — `.github/workflows/security.yml` — 0.5 day
  - `pnpm audit` on every PR (fail on critical/high)
  - Dependabot / Renovate: auto-PR for CVE fixes
  - Snyk or Socket.dev integration for supply chain security
  - SBOM (Software Bill of Materials) generation on each release via CycloneDX
- [ ] **Secret management** — `apps/api/src/config/secrets/` — 0.5 day
  - All secrets from environment variables, never in config files or code
  - Production secrets via HashiCorp Vault or cloud secret manager (AWS Secrets Manager / GCP Secret Manager)
  - Secret rotation: OAuth client secrets, JWT signing keys, API encryption keys — rotation schedule documented
  - Leak detection: pre-commit hook scanning for secret patterns (GitGuardian / `detect-secrets`)
- [ ] **Input validation hardening** — `apps/api/src/validation/` — 0.5 day
  - All API inputs validated with Zod schemas (already planned, but audit coverage)
  - Strict content types: reject requests with unexpected `Content-Type`
  - Payload size limits: 1 MB for JSON bodies, 5 MB for file uploads (if any)
  - SQL injection defense: Prisma parameterized queries (verify no raw SQL without params)
  - XSS defense: never render unescaped user input (CSP headers as defense-in-depth)
- [ ] **Incident response plan** — `docs/security/incident-response.md` — 0.5 day
  - Severity levels: P0 (key compromise) → P4 (minor)
  - Response playbooks: key share compromise, signing node breach, auth bypass, DDoS
  - Communication templates: public disclosure, customer notification, regulator notification
  - Post-mortem template and process

### Task 5.2: DevOps (0.5 week)

- [ ] **Kubernetes deployment** — `infra/k8s/` — 2 days
  - Namespaces: `meluri-prod`, `meluri-staging`
  - Auth service: Deployment (3 replicas) + Service + HorizontalPodAutoscaler (CPU > 70%)
  - MPC service: StatefulSet (3 replicas, stable network IDs for peer discovery) + headless Service
  - PostgreSQL: Cloud SQL / RDS (managed, not in K8s) — connection via Secret + ExternalName Service
  - Redis: ElastiCache / Memorystore (managed) — connection via Secret
  - Ingress: Nginx ingress controller + cert-manager for TLS
  - Resource limits & requests defined for every container
- [ ] **Auto-scaling configuration** — `infra/k8s/hpa.yaml` — 1 day
  - Auth service: HPA based on CPU (target 70%), min 3, max 20 replicas
  - MPC service: not auto-scaled (fixed 3-node cluster for TSS), but node-level redundancy via StatefulSet
  - Custom metrics: scale based on request queue depth, not just CPU
  - Scale-down stabilization: wait 5 minutes before scaling down to prevent flapping
  - Cluster autoscaler: node pool expands if pending pods can't be scheduled
- [ ] **CDN configuration** — `infra/cdn/` — 0.5 day
  - Cloudflare CDN in front of all public endpoints
  - Cache rules: static assets (SDK bundle, docs) cached aggressively, API responses not cached
  - WAF (Web Application Firewall) rules: rate limiting, SQL injection patterns, common attack signatures
  - DDoS protection: Cloudflare's built-in L3/L4 + L7 protection
  - Custom error pages for CDN-level errors (bypass origin on cache miss)
- [ ] **CI/CD pipeline** — `.github/workflows/` — 1 day
  - PR checks: lint, typecheck, unit tests, build, bundle size check
  - Staging deploy: on merge to `main` → build + push Docker image → deploy to staging K8s cluster
  - Production deploy: on release tag → build + push → deploy to production K8s (canary: 10% → 50% → 100%)
  - Rollback: one-click rollback via `kubectl rollout undo` or GitHub workflow dispatch
  - E2E tests run against staging after each deploy
  - Notifications: Slack/Teams integration for deploy success/failure

### Task 5.3: Monitoring (0.5 week)

- [ ] **Grafana dashboards** — `infra/grafana/dashboards/` — 1.5 days
  - Auth service dashboard: login rate by provider, error rate, active sessions, P50/P95/P99 latency
  - MPC service dashboard: DKG rate, signing rate by chain, ceremony duration, failure rate, peer health
  - Business dashboard: new users/day, wallets created/day, active developers, tx volume
  - Infrastructure dashboard: CPU/Memory/Network per service, DB connections, Redis memory usage
  - Alerts configured on all dashboards — link to PagerDuty
- [ ] **Sentry error tracking** — `apps/api/src/instrumentation.ts` — 0.5 day
  - Sentry SDK initialized in both auth service and MPC service
  - Capture unhandled exceptions + unhandled promise rejections
  - Source maps uploaded during CI build (Sentry Release integration)
  - Environment tagging: `production`, `staging`, `development`
  - PII scrubbing: filter out tokens, emails, API keys from error context
- [ ] **PagerDuty on-call setup** — `infra/pagerduty/` — 0.5 day
  - On-call rotations: 2 engineers per shift, weekly rotation
  - Alert severity mapping: P0 (immediate page), P1 (page within 5 min), P2 (page within 30 min), P3 (next business day)
  - Escalation policy: if primary on-call doesn't ack within 5 min → page secondary → page engineering manager
  - Alert sources: Grafana alerts, Sentry critical events, uptime monitor failures
- [ ] **Uptime & synthetic monitoring** — `infra/monitoring/synthetic/` — 0.5 day
  - Uptime checks every 60s from 3 geographic regions on:
    - `GET /health` (auth service)
    - `ws://mpc-node-0:8080` (MPC WebSocket)
    - `GET /.well-known/jwks.json`
  - Synthetic user journey: register → login → create wallet → sign transaction → verify — runs every 15 min
  - Status page: public status.meluri.io (using Atlassian Statuspage or similar)
  - SLA tracking: measure monthly uptime against 99.95% target

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TSS library has undiscovered bugs | Medium | Critical | Extensive testing, external audit, consider fallback to simpler 2-of-3 multisig as interim |
| OAuth provider changes API | Low | Medium | Version-locked provider libs, integration tests that catch breakage early |
| MPC ceremony latency too high for UX | Medium | High | Benchmark early in Phase 2, optimize WebSocket transport, consider colocated deployment |
| Key share storage breach | Low | Critical | KMS encryption, audit logging, penetration testing, no plaintext shares ever |
| Developer adoption slower than expected | Medium | Medium | Publish SDK early (Phase 1), gather feedback, iterate on DX before Phase 5 |
| Regulatory landscape shifts for MPC custody | Low | Medium | Legal review of custody model early on, document non-custodial architecture clearly |

---

## Deliverables Checklist

- [ ] Auth service with 6 OAuth providers + email/magic link — Dockerized, deployed
- [ ] JWT + session management with refresh token rotation
- [ ] Multi-tenant developer platform with API key management
- [ ] React SDK with `useMeluriAuth` + embedded auth modal
- [ ] CDN bundle for vanilla HTML integration
- [ ] MPC TSS service: 2-of-3 DKG + signing for secp256k1
- [ ] Key share distribution, encryption, and recovery flows
- [ ] Wallet orchestration: external wallet connectors + embedded MPC wallet
- [ ] Wallet UI kit: React components, headless hooks, transaction management
- [ ] SDK packaging: NPM, CDN, React Native support
- [ ] Documentation: API reference, SDK docs, Stacks integration guides, example apps
- [ ] Security audit completed with all Critical/High findings resolved
- [ ] Kubernetes deployment with auto-scaling + CDN
- [ ] Grafana dashboards, Sentry integration, PagerDuty on-call
- [ ] Public status page + SLAs defined

---

*Last updated: 2026-05-09*
