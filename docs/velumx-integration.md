# VelumX Relayer Integration

## Overview

Meluri MPC uses **VelumX** — a Relayer-as-a-Service platform — to sponsor transaction gas fees on the Stacks blockchain. Users never need STX to send tokens. The developer's VelumX relayer wallet pays the network fee.

## Architecture

```
┌──────────────┐     signed tx hex      ┌──────────────┐    co-sign + broadcast    ┌──────────────┐
│  Meluri API  │ ──────────────────────► │  VelumX SDK  │ ────────────────────────► │ VelumX Relay │
│  (NestJS)    │ ◄────────────────────── │  @velumx/sdk │ ◄──────────────────────── │  (txid)      │
└──────────────┘       { txid }         └──────────────┘                           └──────────────┘
       │                                                                                  │
       │  build + sign tx                                                                 │
       ▼                                                                                  ▼
┌──────────────┐                                                                ┌──────────────┐
│  Wallet Key  │                                                                │ Stacks Node  │
│  (server)    │                                                                │ (broadcast)  │
└──────────────┘                                                                └──────────────┘
```

## Flow

### 1. Developer Funds Relayer

In the [VelumX Dashboard](https://dashboard.velumx.xyz):
1. Create a project → get API key
2. Fund the relayer address with STX (this is your "gas tank")
3. Note the relayer address for each network (mainnet/testnet)

### 2. Meluri Builds a Sponsored Transaction

```typescript
// simple-wallet.service.ts
const tx = await makeUnsignedSTXTokenTransfer({
  recipient: 'STX_ADDRESS',
  amount: BigInt(1_000_000), // 1 STX in microSTX
  publicKey: wallet.publicKey,
  network: STACKS_TESTNET,
  sponsored: true, // ← key: marks as sponsored
});
```

Key points:
- `sponsored: true` — creates a sponsored auth type
- No `fee` field needed — the relayer sets the fee
- Works for STX transfers, contract calls, and SIP-010 token transfers

### 3. Meluri Signs the Origin

```typescript
const signer = new TransactionSigner(tx);
signer.signOrigin(wallet.privateKey); // user's origin signature
const signedHex = tx.serialize();
```

This produces a **half-signed** transaction: the origin (user) has signed, but the sponsor (relayer) has not.

### 4. VelumX Co-Signs and Broadcasts

```typescript
// relayer.service.ts
import { VelumXClient } from '@velumx/sdk';

const velumx = new VelumXClient({
  paymasterUrl: 'https://api.velumx.xyz/api/v1',
  apiKey: process.env.VELUMX_RELAYER_API_KEY,
  network: 'testnet',
});

const { txid } = await velumx.sponsor(signedTxHex, {
  network: 'testnet',
});
```

VelumX takes the half-signed transaction, adds the sponsor signature using its relayer key, and broadcasts to the Stacks network.

### 5. Result

The user's transaction executes with **zero STX gas cost**. The developer's relayer wallet pays the fee.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VELUMX_RELAYER_URL` | No | `https://api.velumx.xyz/api/v1` | VelumX API base URL |
| `VELUMX_RELAYER_API_KEY` | Yes | — | Your project API key (`vx_...`) |
| `VELUMX_NETWORK` | No | `testnet` | `mainnet` or `testnet` |

### sponsonPolicy: DEVELOPER_SPONSORS

Meluri uses the **DEVELOPER_SPONSORS** policy:
- User pays **nothing** (0 STX gas)
- Developer's relayer wallet covers the network fee
- No paymaster contract needed
- Works for STX transfers, contract calls, and token transfers

## Critical: Do NOT Pass `userId` to Broadcast

**This was the root cause of our `NotEnoughFunds` bug.**

The VelumX broadcast endpoint accepts an optional `userId` field. When provided, the relayer derives the signing key from that userId via HMAC — producing a **different address** than the developer's funded relayer.

```typescript
// ❌ WRONG — derives key from end-user ID (empty wallet)
await velumx.sponsor(signedHex, { userId: 'user123' });

// ✅ CORRECT — uses API key owner's relayer (funded wallet)
await velumx.sponsor(signedHex);
// or with network only:
await velumx.sponsor(signedHex, { network: 'testnet' });
```

The `userId` parameter exists for **per-user spend tracking**, not for key derivation. It should only be passed if you want to attribute spends to specific users, and the developer is responsible for funding the derived key.

## Debugging

### Check Relayer Balance

```bash
curl -X POST https://api.velumx.xyz/api/v1/estimate \
  -H "x-api-key: vx_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"intent":{"estimatedGas":150000},"network":"testnet"}'
```

Returns the relayer address, policy, and fee estimate.

### Verify On-Chain Balance

```bash
curl https://api.testnet.hiro.so/extended/v1/address/STAKRX.../balances
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Broadcast failed: NotEnoughFunds` | Relayer wallet empty, OR `userId` passed in body | Fund relayer in dashboard, remove `userId` |
| `Invalid Signature: r must be 0 < r < n` | Wrong signing method | Use `TransactionSigner.signOrigin()` |
| `Could not parse X as TransactionVersion` | Double-encoded hex | `tx.serialize()` already returns hex — don't wrap in `Buffer.from()` |

## Package

```json
{
  "@velumx/sdk": "^3.1.4"
}
```

## References

- [VelumX Documentation](https://docs.velumx.xyz)
- [VelumX Dashboard](https://dashboard.velumx.xyz)
- [VelumX SDK Reference](https://docs.velumx.xyz/sdk/reference)
