# Stacks Integration Guides

## Sign a Stacks Transaction

```ts
import { VelumxMPC } from '@velumx/mpc';

const velumx = new VelumxMPC({
  apiKey: process.env.VELUMX_API_KEY!,
  auth: { /* your auth */ },
});

// 1. Create a session key (30 min validity)
const session = await velumx.createSession(30);
console.log(`Session active, expires in ${session.remainingMinutes} min`);

// 2. Send STX
const { txid } = await velumx.sendSTX({
  recipient: 'SP2ZNGJ85WSY6PQTSKWDY0MM7NKJQZ5B8N9Y8W6P',
  amount: 1_000_000, // 1 STX in micro-STX
  memo: 'Payment for service',
});
console.log(`Sent: ${txid}`);
```

## Call a Clarity Smart Contract

```ts
import { makeUnsignedContractCall, uintCV, standardPrincipalCV, PostConditionMode } from '@stacks/transactions';

const wallet = await velumx.getWallet();

// Build the contract call
const tx = await makeUnsignedContractCall({
  contractAddress: 'SP2ZNGJ85WSY6PQTSKWDY0MM7NKJQZ5B8N9Y8W6P',
  contractName: 'my-contract',
  functionName: 'do-something',
  functionArgs: [
    uintCV(100),
    standardPrincipalCV(wallet.stxAddress),
  ],
  publicKey: wallet.publicKey,
  network: 'testnet',
  fee: 0n,
  sponsored: true,
  postConditionMode: PostConditionMode.Allow,
});

// Sign with a session key or via Turnkey MPC
const { txHex, delegation } = await velumx.sendSTX({
  recipient: 'SP2...',
  amount: 0, // contract calls typically send 0 STX
});

// The SDK handles signing via session keys or Turnkey automatically
```

## STX Transfer

```ts
const { txid } = await velumx.sendSTX({
  recipient: 'SP2...',
  amount: 5_000_000, // 5 STX
});
console.log(txid);
```

## SIP-009 NFT Transfer

```ts
const { txid } = await velumx.sendNFT({
  contractAddress: 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JP9.nope-brc-20', // Example
  tokenId: 42,
  recipient: 'SP2...',
});
console.log(`NFT transferred: ${txid}`);
```

## SIP-010 FT Transfer

```ts
const { txid } = await velumx.sendToken({
  contractAddress: 'SP2ZNGJ85WSY6PQTSKWDY0MM7NKJQZ5B8N9Y8W6P.usda-token',
  recipient: 'SP2...',
  amount: '50000000', // 50 tokens (with 6 decimals)
});
console.log(`Tokens transferred: ${txid}`);
```

## Batch Transactions

```ts
const results = await velumx.batchSend([
  { type: 'stx', params: { recipient: 'SP2...', amount: 1000000 } },
  { type: 'token', params: { contractAddress: 'SP2...token', recipient: 'SP2...', amount: '1000' } },
]);

for (const r of results) {
  console.log(`TXID: ${r.txid}, Session key used: ${r.usedSessionKey}`);
}
```
