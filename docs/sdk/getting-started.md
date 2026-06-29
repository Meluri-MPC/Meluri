# Getting Started

Install, initialize, and log in with VelumX MPC — in under 5 minutes.

## 1. Install

```bash
npm install @velumx/mpc
# or
pnpm add @velumx/mpc
# or
yarn add @velumx/mpc
```

## 2. Get an API Key

1. Go to [velumx.xyz](https://velumx.xyz) and sign up
2. Create a new API key in the dashboard
3. Copy the key (shown only once)

## 3. Initialize

```ts
import { VelumxMPC } from '@velumx/mpc';

const velumx = new VelumxMPC({
  apiKey: 'vx_sk_...',
  auth: {
    // Use your existing auth (Clerk, Auth0, custom, etc.)
    // VelumX needs: getSession(), login(), logout()
    async getSession() {
      const session = yourAuth.getSession();
      return session ? { userId: session.userId, sessionToken: session.token } : null;
    },
    async login() {
      const session = await yourAuth.login();
      return { userId: session.userId, sessionToken: session.token };
    },
    async logout() {
      await yourAuth.logout();
    },
  },
  network: 'testnet', // or 'mainnet'
});
```

## 4. Login & Get Wallet

```ts
// Users get an MPC wallet automatically on first login
const wallet = await velumx.login();
console.log(wallet.stxAddress); // SP2ZNGJ85W...

// Subsequent calls skip Turnkey setup:
const sameWallet = await velumx.getWallet();
```

## 5. Check Balance

```ts
const balance = await velumx.getBalance();
console.log(balance.stx);          // "10.5"
console.log(balance.tokens);       // [{ symbol: "USDA", balance: "100" }]

const assets = await velumx.getAssets();
console.log(assets.nfts);          // NFT holdings
```

## 6. Send a Transaction

```ts
// Create a session key (valid for 30 minutes)
const session = await velumx.createSession(30);

// Send STX
const { txid } = await velumx.sendSTX({
  recipient: 'SP2ZNGJ85WSY6PQTSKWDY0MM7NKJQZ5B8N9Y8W6P',
  amount: 1_000_000, // 1 STX (in micro-STX)
});

// Send SIP-010 token
const { txid: tokenTxid } = await velumx.sendToken({
  contractAddress: 'SP2...token-name',
  recipient: 'SP2...',
  amount: '1000',
});

// Send SIP-009 NFT
const { txid: nftTxid } = await velumx.sendNFT({
  contractAddress: 'SP2...nft-name',
  tokenId: 42,
  recipient: 'SP2...',
});
```

## 7. Transaction History

```ts
const txs = await velumx.getTransactionHistory();
for (const tx of txs) {
  console.log(`${tx.type}: ${tx.txid} — ${tx.status}`);
}
```

## Next Steps

- [React Integration](./react.md) — Use React hooks and components
- [Next.js Guide](./nextjs.md) — Pages Router and App Router
- [Vanilla JS / CDN](./vanilla.md) — No build tools required
- [React Native](./react-native.md) — Mobile wallet integration
- [API Reference](./api-reference.md) — Complete SDK API documentation
