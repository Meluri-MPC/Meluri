# API Reference

## VelumxMPC

The main SDK client class. Creates and manages MPC wallets for end-users.

```ts
import { VelumxMPC } from '@velumx/mpc';
```

### Constructor

```ts
new VelumxMPC(config: VelumxMPCConfig)
```

**`VelumxMPCConfig`**

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `apiKey` | `string` | Yes | — | Your VelumX API key |
| `auth` | `VelumxMPCAuth` | Yes | — | Auth adapter (see below) |
| `network` | `'mainnet' \| 'testnet'` | No | `'mainnet'` | Stacks network |
| `backendUrl` | `string` | No | `'https://api.velumx.xyz/api/v1'` | Custom API endpoint |

**`VelumxMPCAuth`**

```ts
interface VelumxMPCAuth {
  getSession(): Promise<{ userId: string; sessionToken: string } | null>;
  login(): Promise<{ userId: string; sessionToken: string }>;
  logout(): Promise<void>;
}
```

### Methods

#### `login()`

Authenticate and get or create an MPC wallet.

```ts
login(): Promise<MPCWallet>
```

Returns the user's MPC wallet. Creates one via Turnkey if it doesn't exist.

#### `logout()`

Clear session and sign out.

```ts
logout(): Promise<void>
```

#### `getWallet()`

Get the current user's wallet (must be logged in).

```ts
getWallet(): Promise<MPCWallet>
```

Throws if not authenticated.

#### `createSession(durMinutes?: number)`

Create a session key for gasless signing.

```ts
createSession(durMinutes?: number): Promise<{
  expiresAt: number;
  remainingMinutes: number;
}>
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `durMinutes` | `number` | `30` | Session duration in minutes |

#### `getSessionStatus()`

Check if there's an active session key.

```ts
getSessionStatus(): { active: boolean; remainingMinutes: number } | null
```

#### `getBalance()`

Get STX and token balances.

```ts
getBalance(): Promise<{
  stx: string;
  tokens: Array<{ symbol: string; balance: string }>;
}>
```

#### `getAssets()`

Get full asset breakdown.

```ts
getAssets(): Promise<AssetBalances>
```

**`AssetBalances`**

```ts
interface AssetBalances {
  stx: StxBalance | null;
  tokens: TokenBalance[];
  nfts: NftBalance[];
}
```

#### `getTransactionHistory()`

Get recent transactions.

```ts
getTransactionHistory(): Promise<TransactionRecord[]>
```

#### `sendSTX(params)`

Send STX to an address.

```ts
sendSTX(params: SendSTXParams): Promise<{ txid: string; usedSessionKey: boolean }>
```

**`SendSTXParams`**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `recipient` | `string` | Yes | Stacks address |
| `amount` | `number` | Yes | Amount in micro-STX |
| `memo` | `string` | No | Optional memo (max 34 bytes) |

#### `sendToken(params)`

Send SIP-010 fungible tokens.

```ts
sendToken(params: SendTokenParams): Promise<{ txid: string; usedSessionKey: boolean }>
```

**`SendTokenParams`**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `contractAddress` | `string` | Yes | Contract ID (e.g. `"SP2...token-name"`) |
| `recipient` | `string` | Yes | Recipient address |
| `amount` | `string` | Yes | Raw integer amount |

#### `sendNFT(params)`

Send SIP-009 NFTs.

```ts
sendNFT(params: SendNFTParams): Promise<{ txid: string; usedSessionKey: boolean }>
```

**`SendNFTParams`**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `contractAddress` | `string` | Yes | Contract ID |
| `tokenId` | `number \| string` | Yes | NFT token ID |
| `recipient` | `string` | Yes | Recipient address |

#### `batchSend(txs)`

Send multiple transactions in parallel.

```ts
batchSend(txs: Array<
  { type: 'stx'; params: SendSTXParams } |
  { type: 'token'; params: SendTokenParams } |
  { type: 'nft'; params: SendNFTParams }
>): Promise<Array<{ txid: string; usedSessionKey: boolean }>>
```

---

## Types

### MPCWallet

```ts
interface MPCWallet {
  id: string;
  userId: string;
  stxAddress: string;
  publicKey: string;
  network: string;
  createdAt: string;
  turnkeyWalletId?: string;
}
```

### StxBalance

```ts
interface StxBalance {
  assetType: 'STX';
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
}
```

### TokenBalance

```ts
interface TokenBalance {
  assetType: 'FT';
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
}
```

### NftBalance

```ts
interface NftBalance {
  assetType: 'NFT';
  contractAddress: string;
  symbol: string;
  name: string;
  tokenId: string;
  metadataUri?: string;
}
```

### TransactionRecord

```ts
interface TransactionRecord {
  id: string;
  txid: string;
  type: string;
  fromAddress: string;
  toAddress?: string;
  amount?: string;
  status: string;
  blockHeight?: number;
  network: string;
  createdAt: string;
}
```

### SessionDelegation

```ts
interface SessionDelegation {
  sessionPublicKey: string;
  walletPublicKey: string;
  walletAddress: string;
  expiresAt: number;
  nonce: string;
  signature: { r: string; s: string; v: string };
}
```

### SessionKey

```ts
interface SessionKey {
  privateKey: string;
  publicKey: string;
  delegation: SessionDelegation;
}
```

---

## Subpath Exports

```ts
// Core client
import { VelumxMPC } from '@velumx/mpc';

// React hooks + components
import { WalletProvider, useWallet, WalletButton } from '@velumx/mpc/react';

// Wallet connectors + discovery
import { leatherConnector, showWalletDiscoveryModal } from '@velumx/mpc/wallets';

// React UI components (direct access)
import { WalletModal, SendForm } from '@velumx/mpc/ui';

// React Native
import { VelumXMPCNative, NativeStorage, NativeOAuth } from '@velumx/mpc/native';
```
