# Postmortem: Issues Encountered & Resolved

This document catalogues every issue encountered during the development and deployment of Meluri MPC, with root causes and fixes.

---

## 1. VelumX Relayer: `NotEnoughFunds`

**Symptom:**
```
VelumX RelayerError: Broadcast failed: NotEnoughFunds
```

**Root Cause:**
The broadcast body included `userId` (the end-user's database ID). VelumX's server uses `userId` to derive the signing key via HMAC. When an end-user ID was passed, the server derived a signing key for that user — producing a **different wallet address** than the developer's funded relayer. That derived address had 0 STX.

**Fix:**
Remove `userId` from the broadcast body entirely. The VelumX server then defaults to the API key owner's relayer key, which IS funded.

```typescript
// ❌ WRONG — derives key from end-user ID (empty wallet)
await velumx.sponsor(signedHex, { userId: 'user123' });

// ✅ CORRECT — uses API key owner's relayer (funded wallet)
await velumx.sponsor(signedHex);
```

**Files changed:** `apps/api/src/relayer/relayer.service.ts`, `apps/api/src/simple-wallet/simple-wallet.service.ts`

---

## 2. VelumX Relayer: `Invalid Signature: r must be 0 < r < n`

**Symptom:**
```
VelumX RelayerError: Invalid Signature: r must be 0 < r < n
```

**Root Cause:**
Signing was done manually using `@noble/secp256k1` with manual signature assembly (`compact.slice(0, 32)`, then appending r, s, and hardcoded recovery byte `0x01`). The recovery byte must match the signature's actual recovery parameter, not be hardcoded. Additionally, the transaction serialization and signature format must match exactly what the Stacks network expects.

**Fix:**
Use the Stacks SDK's native signing via `TransactionSigner.signOrigin()` or the lower-level `tx.signBegin()` + `tx.signNextOrigin()`. These handle the correct signature format, recovery byte, and transaction serialization internally.

```typescript
// ✅ Use Stacks SDK native signing
const signer = new TransactionSigner(tx);
signer.signOrigin(wallet.privateKey);
const signedHex = tx.serialize();
```

**Files changed:** `apps/api/src/simple-wallet/simple-wallet.service.ts`

---

## 3. VelumX Relayer: `Could not parse 56 as TransactionVersion`

**Symptom:**
```
VelumX: Could not parse 56 as TransactionVersion
```

**Root Cause:**
`tx.serialize()` in `@stacks/transactions` v7.4 returns a **hex string** (confirmed by source: `return bytesToHex(this.serializeBytes())`). Wrapping it in `Buffer.from(tx.serialize()).toString('hex')` caused **double-encoding**: the hex string was treated as UTF-8 bytes, then re-encoded.

- Testnet version byte `0x80` → hex character `"8"` (ASCII 0x38 = 56 decimal)
- VelumX tried to parse `0x38` as the transaction version and failed

**Fix:**
Use `tx.serialize()` directly — it already returns a valid hex string.

```typescript
// ❌ WRONG — double-encoding
const signedHex = Buffer.from(tx.serialize()).toString('hex');

// ✅ CORRECT — serialize() already returns hex
const signedHex = tx.serialize() as string;
```

**Files changed:** `apps/api/src/simple-wallet/simple-wallet.service.ts`

---

## 4. VelumX Relayer: `Signer hash does not equal hash of public key(s)`

**Symptom:**
```
VelumX RelayerError: Signer hash does not equal hash of public key(s): 5e7279... != 4c0c80...
```
*(Affected token transfers only; STX transfers worked.)*

**Root Cause:**
`privateKeyToPublic()` from `@stacks/transactions` returns a **hex string** (type `Hex = string` in the Stacks SDK), not raw bytes. The code was wrapping it in `Buffer.from(privateKeyToPublic(key)).toString('hex')`, which:
1. Took the hex string (e.g., `"04d7e98..."`)
2. Created a Buffer from its UTF-8 byte representation
3. Re-encoded those bytes as hex → producing a 256-character garbled string

This double-encoded public key was passed to `makeUnsignedContractCall()`. The Stacks SDK's contract call builder apparently has stricter public key validation than the STX transfer builder, so STX transfers tolerated the double-encoding while contract calls did not.

**The debug log confirmed this:**
```
pubKey: 30343564376539383036366263316137... (256 chars, double-encoded)
stored: 30343564376539383036366263316137... (256 chars, same — old wallets also double-encoded)
match: true  (both wrong but consistent)
```

**Fix:**
Use `privateKeyToPublic(key)` directly — it already returns a properly formatted hex string.

```typescript
// ❌ WRONG — double-encoding
const pubKey = Buffer.from(privateKeyToPublic(wallet.privateKey)).toString('hex');

// ✅ CORRECT — already hex
const pubKey = privateKeyToPublic(wallet.privateKey) as string;
```

**Files changed:** `apps/api/src/simple-wallet/simple-wallet.service.ts`

**Note:** Old wallets in the database have double-encoded public keys. The signing code now derives the public key fresh from the private key at signing time, so both old and new wallets work correctly.

---

## 5. Prisma Engine Binary Missing on Vercel

**Symptom:**
```
PrismaClientInitializationError: Prisma Client could not locate the Query Engine for runtime "rhel-openssl-3.0.x"
```

**Root Cause:**
Next.js builds in Vercel's serverless environment bundle the app, but Prisma's native query engine binary (`libquery_engine-rhel-openssl-3.0.x.so.node`) was not included in the deployment bundle. Vercel's bundler didn't trace the engine file.

**Fix:**
Added `serverExternalPackages: ['@prisma/client']` to `next.config.js`. This tells Next.js to keep Prisma as an external dependency rather than bundling it, preserving native binaries.

Also added `binaryTargets` to `prisma/schema.prisma`:
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}
```

Additional fix: `prisma generate` must run before `next build`:
```json
"build": "prisma generate --schema=./prisma/schema.prisma && next build"
```

**Files changed:** `apps/dashboard/next.config.js`, `apps/dashboard/package.json`, `apps/dashboard/prisma/schema.prisma`

---

## 6. Vercel: TypeScript `implicit any` Build Error

**Symptom:**
```
Type error: Parameter 'key' implicitly has an 'any' type.
```
During Vercel's Next.js production build.

**Root Cause:**
The dashboard's `tsconfig.json` has `strict: true`, which enables `noImplicitAny`. The Prisma query results weren't typed because Prisma client generation hadn't completed before the Next.js build step. Prisma's postinstall script couldn't find the schema file (custom path in monorepo).

**Fix:**
Added `prisma generate --schema=./prisma/schema.prisma` before `next build` in the build script. This ensures type generation happens first.

**Files changed:** `apps/dashboard/package.json`

---

## 7. Vercel: No Output Directory Found

**Symptom:**
```
Error: No Output Directory named "public" found after the Build completed.
```

**Root Cause:**
Vercel didn't auto-detect the framework as Next.js in the monorepo configuration. It was looking for a static `public` directory instead of the `.next` output.

**Fix:**
Added `vercel.json` to explicitly declare the framework:
```json
{ "framework": "nextjs" }
```

**Files changed:** `apps/dashboard/vercel.json`

---

## 8. Netlify: Blank Page (React Runtime Error)

**Symptom:**
Page loaded but showed completely blank. Console error:
```
Uncaught ReferenceError: email is not defined
```

**Root Cause:**
The `App.tsx` state variable was renamed from `email` to `identifier`, but two `disabled` attribute expressions still referenced the old `email` variable:
```jsx
<button disabled={loading || !email.trim()}>  // ← leftover email reference
```

React 19 in production mode catches errors silently and unmounts the component tree, resulting in a blank page with no visible error.

**Fix:**
Renamed all remaining `email` references to `identifier`.

```bash
grep -n '\bemail\b' apps/demo/src/App.tsx  # found 2 remaining references
```

**Files changed:** `apps/demo/src/App.tsx`

---

## 9. Netlify: Build Base Directory Confusion

**Symptom:**
```
No package.json found in /opt
```

**Root Cause:**
Two conflicting `netlify.toml` files existed — one at repo root and one at `apps/demo/`. Netlify detected the inner one and set the base directory to `apps/demo`. The `cd ../..` in the build command then resolved to `/opt` (outside the repo).

Additionally, `base = "/"` in the root `netlify.toml` is invalid Netlify syntax.

**Fix:**
- Removed `apps/demo/netlify.toml` (duplicate)
- Removed `base = "/"` from root `netlify.toml`
- Kept only the root `netlify.toml` with correct publish path: `publish = "apps/demo/dist"`

**Files changed:** `netlify.toml` (modified), `apps/demo/netlify.toml` (deleted)

---

## 10. Render: Lockfile Out of Sync

**Symptom:**
```
ERR_PNPM_OUTDATED_LOCKFILE: Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date
```

**Root Cause:**
Removed `@clerk/clerk-js` from `packages/sdk/package.json` (peer dependency) and `apps/demo/package.json` without running `pnpm install` to update the lockfile.

**Fix:**
```bash
pnpm install --no-frozen-lockfile
```

**Files changed:** `pnpm-lock.yaml`

---

## 11. Clerk CDN URL: `ERR_NAME_NOT_RESOLVED`

**Symptom:**
```
clerk.browser.js: Failed to load resource: net::ERR_NAME_NOT_RESOLVED
```

**Root Cause:**
Used the generic CDN URL `https://js.clerk.com/npm/@clerk/clerk-js@5/dist/clerk.browser.js` which doesn't exist. Clerk hosts the JS bundle on the project-specific Frontend API domain.

**Fix:**
Decoded the Clerk publishable key to get the Frontend API domain:
- Key: `pk_test_Z2xhZC1oZW4tODguY2xlcmsuYWNjb3VudHMuZGV2JA`
- Base64 decoded: `glad-hen-88.clerk.accounts.dev`
- Correct URL: `https://glad-hen-88.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js`

Also added `data-clerk-publishable-key` attribute to the script tag for proper Clerk initialization.

**Files changed:** `apps/demo/src/App.tsx`

---

## 12. Clerk Google OAuth: Infinite Loading

**Symptom:**
After clicking "Sign in with Google", the Clerk modal appeared but spun indefinitely.

**Root Cause:**
Google OAuth redirects the page (not just the modal). The `await clerk.openSignIn()` promise never resolved because the page reloaded mid-flow. The login handler was structured to `await meluri.login()` which called `await clerk.openSignIn()` — the promise was lost on redirect.

**Fix:**
Restructured the login flow to handle OAuth redirects:
1. Login button calls `clerk.openSignIn({ afterSignInUrl: window.location.href })` — redirects
2. On page load (after redirect), `useEffect` checks `Clerk.user` and auto-restores session
3. No longer `await` the login call — just trigger the redirect

**Files changed:** `apps/demo/src/App.tsx`

---

## 13. SDK Browser Compatibility: Node.js Crypto/Buffer

**Symptom:**
Building the demo Vite app failed because the SDK (`@meluri/mpc`) imported Node.js modules (`crypto`, `Buffer`) that don't exist in browsers.

**Root Cause:**
The SDK was designed as Node.js-only (CommonJS output) but was being imported into a browser Vite app.

**Fix:**
Created browser polyfills for `crypto` and `Buffer` at `apps/demo/src/polyfills/`:
- `crypto.ts` — synchronous SHA-256 implementation + `randomBytes` using Web Crypto API
- `buffer.ts` — `Buffer` class extending `Uint8Array` with `from()`, `concat()`, `toString('hex')`

Configured Vite aliases to use these polyfills:
```typescript
resolve: {
  alias: {
    '@meluri/mpc': path.resolve(__dirname, '../../packages/sdk/src'),
    'crypto': path.resolve(__dirname, 'src/polyfills/crypto.ts'),
    'buffer': path.resolve(__dirname, 'src/polyfills/buffer.ts'),
  },
}
```

**Files changed:** `apps/demo/vite.config.ts`, `apps/demo/src/polyfills/crypto.ts`, `apps/demo/src/polyfills/buffer.ts`

---

## 14. Turnkey Iframe: Cannot Sign Without Credential

**Symptom:**
```
Error: cannot sign payload without credential. Credential bytes are null.
Has a credential bundle been injected into the iframe?
```

**Root Cause:**
The Turnkey iframe container had `display: none`, making the iframe invisible. Turnkey's `IframeStamper` requires user interaction with the iframe to authenticate (passkey creation). A hidden iframe cannot receive user interaction.

**Fix:**
Changed the container to a full-screen overlay during authentication, then hidden after auth completes:
```typescript
container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
// ... after stamper.init():
container.style.display = 'none';
```

**Files changed:** `packages/sdk/src/turnkey.ts`

---

## 15. Noble secp256k1: `hmacSha256Sync not set`

**Symptom:**
```
Error: hashes.hmacSha256Sync not set
```
On Render (Node.js production environment).

**Root Cause:**
`@noble/secp256k1` v2.x requires explicit `hmacSha256Sync` initialization. In v1.x, this was auto-initialized. In v2.x, it must be set manually using `crypto.createHmac`.

**Fix:**
Added HMAC initialization at module load time:
```typescript
import * as crypto from 'crypto';
import * as secp from '@noble/secp256k1';

secp.etc.hmacSha256Sync = (key: Uint8Array, ...msgs: Uint8Array[]) => {
  const h = crypto.createHmac('sha256', Buffer.from(key));
  for (const msg of msgs) h.update(Buffer.from(msg));
  return h.digest();
};
```

**Files changed:** `apps/api/src/simple-wallet/simple-wallet.service.ts`

---

## 16. CORS: API Blocking Requests from New Origins

**Symptom:**
```
Access to fetch at 'https://meluri.onrender.com/api/v1/...' from origin 'http://localhost:5173' 
has been blocked by CORS policy
```
And later:
```
from origin 'https://meluri.netlify.app' has been blocked by CORS policy
```

**Root Cause:**
The API's CORS configuration only allowed `localhost:3000-3002`, `meluri.xyz`, `vercel.app`, and `onrender.com`. New origins (Vite dev server on 5173, Netlify deployments) were not included.

**Fix:**
Added `localhost:5173`, a wildcard localhost regex, and `.netlify.app` to CORS origins:
```typescript
app.enableCors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:5173',
    'https://meluri.xyz',
    /\.vercel\.app$/,
    /\.meluri\.xyz$/,
    /\.onrender\.com$/,
    /\.netlify\.app$/,
    /^http:\/\/localhost:\d+$/,
  ],
});
```

**Files changed:** `apps/api/src/main.ts`

---

## 17. Session Not Persisting Across Page Refresh

**Symptom:**
After creating/loading a wallet, refreshing the page showed the login form again. The wallet state was lost.

**Root Cause:**
The wallet state (`identifier`, `wallet` object) was only stored in React component state, which is cleared on page refresh.

**Fix:**
Added `localStorage` persistence and auto-restore on mount:
1. On wallet creation/load: save `{ identifier, wallet }` to `localStorage`
2. On mount: read from `localStorage`, fetch wallet from API (not from stored data, to ensure it's current)
3. On "Switch Account": clear `localStorage`

```typescript
useEffect(() => {
  const saved = localStorage.getItem('meluri_demo_wallet');
  if (saved) {
    const { identifier: savedId } = JSON.parse(saved);
    fetch(`${API_URL}/wallets/simple/${savedId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) { updateWallet(data); fetchAll(data.stxAddress); } });
  }
  setLoading(false);
}, []);
```

**Files changed:** `apps/demo/src/App.tsx`

---

## Summary

| # | Issue | Category | Root Cause | Fix Strategy |
|---|-------|----------|------------|--------------|
| 1 | NotEnoughFunds | VelumX | `userId` caused wrong key derivation | Remove `userId` from broadcast |
| 2 | Invalid Signature: r < n | Signing | Manual signing with noble/secp256k1 | Use Stacks SDK TransactionSigner |
| 3 | Parse 56 as TransactionVersion | Encoding | Double-encoding serialize() output | Remove Buffer.from wrapper |
| 4 | Signer hash mismatch | Encoding | Double-encoding privateKeyToPublic | Remove Buffer.from wrapper |
| 5 | Prisma engine not found | Vercel | Native binary not bundled | serverExternalPackages + binaryTargets |
| 6 | Implicit any type error | Vercel | Prisma types missing at build | Generate before Next.js build |
| 7 | No output directory | Vercel | Framework not detected | Explicit vercel.json |
| 8 | Blank page | Netlify | Leftover `email` variable ref | Rename all to `identifier` |
| 9 | Build root confusion | Netlify | Duplicate netlify.toml | Single root config |
| 10 | Lockfile out of sync | Render | Dependency removed without install | Run pnpm install |
| 11 | Clerk CDN URL error | Demo | Wrong URL domain | Use project-specific Clerk domain |
| 12 | Infinite loading | Clerk OAuth | Promise lost on redirect | Don't await, use on-mount restore |
| 13 | Node.js crypto in browser | SDK | No browser polyfills | Vite alias to polyfill modules |
| 14 | Cannot sign without cred | Turnkey | Hidden iframe | Show as overlay during auth |
| 15 | hmacSha256Sync not set | Server | Noble v2 needs explicit init | Set at module load |
| 16 | CORS blocked | API | Missing origin | Add to CORS config |
| 17 | Session lost on refresh | Demo | State in React only | localStorage + API restore |
