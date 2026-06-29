# Sign a Stacks Transaction

Full walkthrough of signing and broadcasting a Stacks transaction with VelumX MPC.

## Prerequisites

- VelumX MPC SDK installed (`pnpm add @velumx/mpc`)
- API key from [velumx.xyz](https://velumx.xyz/dashboard)
- User authenticated via `velumx.login()`

## 1. Simple STX Transfer

```ts
import { VelumxMPC } from '@velumx/mpc';

const velumx = new VelumxMPC({
  apiKey: 'vx_sk_...',
  auth: { /* your auth */ },
  network: 'testnet',
});

// Login (creates wallet if new user)
const wallet = await velumx.login();

// Send 1 STX
const { txid, usedSessionKey } = await velumx.sendSTX({
  recipient: 'SP2ZNGJ85WSY6PQTSKWDY0MM7NKJQZ5B8N9Y8W6P',
  amount: 1_000_000, // 1 STX = 1,000,000 micro-STX
  memo: 'Payment for coffee',
});

console.log(`Sent! TXID: ${txid}`);
console.log(`Used session key: ${usedSessionKey}`);
```

## 2. With Session Key (Gasless)

Session keys allow multiple transactions without re-authenticating:

```ts
// Create a 30-minute session key
const session = await velumx.createSession(30);
console.log(`Session expires in ${session.remainingMinutes} minutes`);

// Now send multiple transactions without re-signing
const txs = await velumx.batchSend([
  { type: 'stx', params: { recipient: 'SP2...AAAA', amount: 500_000 } },
  { type: 'stx', params: { recipient: 'SP2...BBBB', amount: 250_000 } },
  { type: 'stx', params: { recipient: 'SP2...CCCC', amount: 100_000 } },
]);

// Each transaction is signed with the session key — no Turnkey popup needed
for (const tx of txs) {
  console.log(`TXID: ${tx.txid}, session-signed: ${tx.usedSessionKey}`);
}
```

## 3. Check Transaction Status

```ts
const txs = await velumx.getTransactionHistory();

for (const tx of txs) {
  console.log(`${tx.type}: ${tx.status} — ${tx.txid}`);
  if (tx.blockHeight) {
    console.log(`  Confirmed in block #${tx.blockHeight}`);
  }
}
```

## 4. Advanced: Manual Build, Sign, Send

If you need fine-grained control:

```ts
import {
  makeUnsignedSTXTokenTransfer,
  publicKeyToAddress,
} from '@stacks/transactions';

const wallet = await velumx.getWallet();

// Step 1: Build unsigned transaction
const tx = await makeUnsignedSTXTokenTransfer({
  recipient: 'SP2...',
  amount: 1_000_000n,
  publicKey: wallet.publicKey,
  network: 'testnet',
  fee: 0n,
  sponsored: true,
});

// Step 2: Send through VelumX (signs + broadcasts)
const result = await velumx.sendSTX({
  recipient: 'SP2...',
  amount: 1_000_000,
});

// Or use the raw API:
const response = await fetch('https://api.velumx.xyz/api/v1/tx/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'vx_sk_...',
  },
  body: JSON.stringify({
    txHex: result.txid,
    senderAddress: wallet.stxAddress,
    network: 'testnet',
  }),
});
```

## Fee Estimation

```ts
// Fees are auto-estimated by default
// For custom fees, use the raw API:
const feeResponse = await fetch(
  `https://api.velumx.xyz/api/v1/wallets/${wallet.id}/transactions/estimate-fee`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'vx_sk_...',
    },
  }
);

const { low, medium, high } = await feeResponse.json();
console.log(`Fees: low=${low}, med=${medium}, high=${high} micro-STX`);
```
