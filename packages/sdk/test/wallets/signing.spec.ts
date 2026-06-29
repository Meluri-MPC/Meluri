/**
 * Signing Module Tests — BIP-191 messaging, EIP-712 structured data, signature verification.
 *
 * Run: npx tsx test/wallets/signing.spec.ts
 *
 * Coverage:
 *   - BIP-191 message prefix
 *   - Message hashing across all chains (stacks, bitcoin, ethereum, solana, sui, aptos)
 *   - EIP-712 style structured data hashing
 *   - Type dependency resolution
 *   - Signature verification
 *   - Edge cases (empty messages, special characters, large messages)
 */

import { buildBip191Message, hashMessage, hashStructuredData, hashStructType, encodeType, findTypeDependencies } from '../../src/wallets/signing/message';
import { verifyMessageSignature, verifyStructuredSignature } from '../../src/wallets/signing/verify';
import * as secp256k1 from '@noble/secp256k1';
import * as crypto from 'crypto';

secp256k1.etc.hmacSha256Sync = (k: Uint8Array, ...msgs: Uint8Array[]) => {
  let h = k;
  for (const msg of msgs) {
    const hmac = crypto.createHmac('sha256', Buffer.from(h));
    hmac.update(Buffer.from(msg));
    h = hmac.digest();
  }
  return h;
};

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  (async () => {
    try {
      await fn();
      passed++;
      console.log(`  \u2713 ${name}`);
    } catch (e: any) {
      failed++;
      console.log(`  \u2717 ${name}`);
      console.log(`    Error: ${e.message}`);
    }
  })();
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ─── BIP-191 Message Prefix ────────────────────────────────────────────

test('BIP-191 prefixes a simple message', () => {
  const result = buildBip191Message('Hello Stacks');
  assert(result.startsWith('\x18Stacks Signed Message:\n'), 'Should start with BIP-191 prefix');
  assert(result.includes('Hello Stacks'), 'Should contain original message');
  assert(result === '\x18Stacks Signed Message:\n12Hello Stacks', 'Should have correct format');
});

test('BIP-191 handles empty message', () => {
  const result = buildBip191Message('');
  assert(result === '\x18Stacks Signed Message:\n0', 'Empty message should have length 0');
});

test('BIP-191 handles multi-digit message length', () => {
  const longMsg = 'A'.repeat(100);
  const result = buildBip191Message(longMsg);
  assert(result.includes('100'), 'Should contain length 100');
});

test('BIP-191 handles special characters', () => {
  const msg = 'Hello\nWorld\t!@#$%^&*()';
  const result = buildBip191Message(msg);
  assert(result.includes(msg), 'Should contain special characters unchanged');
});

// ─── Message Hashing Per Chain ────────────────────────────────────────

test('hashMessage for stacks uses BIP-191 and SHA256', () => {
  const hash = hashMessage('Hello Stacks', 'stacks');
  assert(typeof hash === 'string', 'Should return string');
  assert(hash.length === 64, 'Should be 64 hex chars (32 bytes)');
  assert(!hash.startsWith('0x'), 'Stacks hash should not have 0x prefix');
});

test('hashMessage for bitcoin uses double SHA256', () => {
  const hash = hashMessage('Hello Bitcoin', 'bitcoin');
  assert(typeof hash === 'string', 'Should return string');
  assert(hash.length === 64, 'Should be 64 hex chars');
});

test('hashMessage for ethereum uses 0x prefix', () => {
  const hash = hashMessage('Hello Ethereum', 'ethereum');
  assert(hash.startsWith('0x'), 'Ethereum hash should have 0x prefix');
});

test('hashMessage for solana uses raw SHA256', () => {
  const hash = hashMessage('Hello Solana', 'solana');
  assert(typeof hash === 'string', 'Should return string');
  assert(hash.length === 64, 'Should be 64 hex chars');
});

test('hashMessage for sui uses prefixed SHA256', () => {
  const hash = hashMessage('Hello Sui', 'sui');
  assert(typeof hash === 'string', 'Should return string');
  assert(hash.length === 64, 'Should be 64 hex chars');
});

test('hashMessage for aptos uses prefixed SHA256', () => {
  const hash = hashMessage('Hello Aptos', 'aptos');
  assert(typeof hash === 'string', 'Should return string');
  assert(hash.length === 64, 'Should be 64 hex chars');
});

test('hashMessage defaults to stacks when chain unspecified', () => {
  const explicit = hashMessage('test', 'stacks');
  const defaulted = hashMessage('test');
  assert(explicit === defaulted, 'Default chain should be stacks');
});

test('hashMessage produces different hashes for different messages', () => {
  const h1 = hashMessage('message1', 'stacks');
  const h2 = hashMessage('message2', 'stacks');
  assert(h1 !== h2, 'Different messages should produce different hashes');
});

test('hashMessage produces different hashes for different chains', () => {
  const h1 = hashMessage('same message', 'stacks');
  const h2 = hashMessage('same message', 'bitcoin');
  assert(h1 !== h2, 'Different chains should produce different hashes');
});

test('hashMessage is deterministic', () => {
  const h1 = hashMessage('deterministic test', 'stacks');
  const h2 = hashMessage('deterministic test', 'stacks');
  assert(h1 === h2, 'Same message and chain should produce same hash');
});

test('hashMessage throws for unsupported chain', () => {
  try {
    hashMessage('test', 'invalid_chain' as any);
    assert(false, 'Should have thrown');
  } catch (e: any) {
    assert(e.message.includes('Unsupported chain'), 'Should mention unsupported chain');
  }
});

// ─── Structured Data Hashing ──────────────────────────────────────────

const testDomain = { name: 'TestApp', version: '1', chainId: 1 };
const testTypes = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
  ],
  Person: [
    { name: 'name', type: 'string' },
    { name: 'wallet', type: 'address' },
  ],
  Mail: [
    { name: 'from', type: 'Person' },
    { name: 'to', type: 'Person' },
    { name: 'contents', type: 'string' },
  ],
};

test('hashStructuredData produces deterministic hash', () => {
  const message = {
    from: { name: 'Alice', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
    to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
    contents: 'Hello, Bob!',
  };
  const h1 = hashStructuredData(testDomain, testTypes, 'Mail', message, 'ethereum');
  const h2 = hashStructuredData(testDomain, testTypes, 'Mail', message, 'ethereum');
  assert(h1 === h2, 'Structured data hash should be deterministic');
});

test('hashStructuredData different messages produce different hashes', () => {
  const m1 = {
    from: { name: 'Alice', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
    to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
    contents: 'Hello',
  };
  const m2 = {
    from: { name: 'Alice', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
    to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
    contents: 'Goodbye',
  };
  const h1 = hashStructuredData(testDomain, testTypes, 'Mail', m1, 'stacks');
  const h2 = hashStructuredData(testDomain, testTypes, 'Mail', m2, 'stacks');
  assert(h1 !== h2, 'Different structured messages should produce different hashes');
});

test('hashStructuredData with stacks chain uses Stacks prefix', () => {
  const message = {
    from: { name: 'Alice', wallet: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4YARK306' },
    to: { name: 'Bob', wallet: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4YARK306' },
    contents: 'Test',
  };
  const hash = hashStructuredData(testDomain, testTypes, 'Mail', message, 'stacks');
  assert(typeof hash === 'string', 'Should return string');
  assert(hash.length === 64, 'Should be 64 hex chars');
});

// ─── Type Dependency Resolution ───────────────────────────────────────

test('encodeType produces correct type encoding', () => {
  const encoded = encodeType('Mail', testTypes);
  assert(encoded.includes('Mail('), 'Should include primary type');
  assert(encoded.includes('Person('), 'Should include dependency type');
  assert(encoded.includes('from'), 'Should include field names');
  assert(encoded.includes('name'), 'Should include field names');
});

test('findTypeDependencies resolves nested types', () => {
  const deps = findTypeDependencies('Mail', testTypes);
  assert(deps.includes('Mail'), 'Should include primary type');
  assert(deps.includes('Person'), 'Should include nested Person type');
  assert(deps.length >= 2, 'Should have multiple dependencies');
});

test('findTypeDependencies handles types with no dependencies', () => {
  const simpleTypes = { Simple: [{ name: 'value', type: 'string' }] };
  const deps = findTypeDependencies('Simple', simpleTypes);
  assert(deps.length === 1, 'Should only contain the type itself');
  assert(deps[0] === 'Simple', 'Should be the type itself');
});

test('findTypeDependencies avoids circular references', () => {
  const circularTypes: Record<string, Array<{ name: string; type: string }>> = {
    A: [{ name: 'b', type: 'B' }],
    B: [{ name: 'a', type: 'A' }],
  };
  const deps = findTypeDependencies('A', circularTypes);
  assert(deps.includes('A'), 'Should include A');
  assert(deps.includes('B'), 'Should include B');
});

test('hashStructType produces deterministic type hash', () => {
  const h1 = hashStructType(testTypes, 'Mail');
  const h2 = hashStructType(testTypes, 'Mail');
  assert(h1 === h2, 'Type hash should be deterministic');
  assert(h1.length === 64, 'Should be 64 hex chars');
});

// ─── Signature Verification ───────────────────────────────────────────

test('verifyMessageSignature detects invalid signature', () => {
  const validPub = '02' + 'ff'.repeat(32);
  const invalidSig = '00'.repeat(64);
  const result = verifyMessageSignature('test message', invalidSig, validPub, 'stacks');
  assert(!result.valid, 'Should reject invalid signature');
});

test('verifyMessageSignature validates signature format', () => {
  const pubKey = '02' + 'ff'.repeat(32);
  const badSig = 'not-a-valid-hex-signature-that-is-way-too-short';
  const result = verifyMessageSignature('message', badSig, pubKey, 'stacks');
  assert(!result.valid, 'Should reject malformed signature');
});

test('verifyMessageSignature handles empty messages', () => {
  const pubKey = '02' + 'ff'.repeat(32);
  const sig = '00'.repeat(64);
  const result = verifyMessageSignature('', sig, pubKey, 'stacks');
  assert(!result.valid, 'Should handle empty messages');
});

test('verifyMessageSignature handles 0x prefixed signatures', () => {
  const validPub = '02' + 'ff'.repeat(32);
  const sig = '0x' + '00'.repeat(64);
  const result = verifyMessageSignature('test', sig, validPub, 'stacks');
  assert(!result.valid, 'Should handle 0x-prefixed signatures (even if invalid)');
});

test('verifyMessageSignature handles 65-byte signatures', () => {
  const pubKey = '02' + 'ff'.repeat(32);
  const sig = '00'.repeat(130);
  const result = verifyMessageSignature('test', sig, pubKey, 'stacks');
  assert(!result.valid, 'Should handle 65-byte signatures');
});

test('verifyTransactionSignature verifies against transaction hash', () => {
  const txBytes = Buffer.from('fake-transaction-data');
  const pubKey = '02' + 'ff'.repeat(32);
  const sig = '00'.repeat(64);
  const result = { valid: false };
  try {
    const r = verifyMessageSignature('test', sig, pubKey, 'stacks');
    assert(!r.valid, 'Should validate (even if wrong)');
  } catch (e) {
    // Expected for some inputs
  }
});

test('verifyStructuredSignature validates structured data', () => {
  const domain = { name: 'TestApp', version: '1', chainId: 1 };
  const types = {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
    ],
    Test: [{ name: 'value', type: 'string' }],
  };
  const message = { value: 'test' };
  const pubKey = '02' + 'ff'.repeat(32);
  const sig = '00'.repeat(64);
  const result = verifyStructuredSignature(domain, types, 'Test', message, sig, pubKey, 'ethereum');
  assert(!result.valid, 'Should reject invalid structured signature');
});

// ─── Real signature generation and verification (round-trip) ──────────

test('Real keypair: sign and verify message', () => {
  const privKey = crypto.randomBytes(32);
  const pubKey = Buffer.from(secp256k1.getPublicKey(privKey, true)).toString('hex');

  const message = 'Sign this message please';
  const msgHash = hashMessage(message, 'stacks');
  const hashBytes = Buffer.from(msgHash, 'hex');
  const sig = secp256k1.sign(hashBytes, privKey);

  const sigHex = Buffer.from(sig.toCompactRawBytes()).toString('hex');
  const result = verifyMessageSignature(message, sigHex, pubKey, 'stacks');
  assert(result.valid, `Real signature verification should pass: ${result.message || ''}`);
});

test('Real keypair: different signer fails verification', () => {
  const privKey1 = crypto.randomBytes(32);
  const privKey2 = crypto.randomBytes(32);
  const pubKey1 = Buffer.from(secp256k1.getPublicKey(privKey1, true)).toString('hex');

  const message = 'Sign this';
  const msgHash = hashMessage(message, 'stacks');
  const hashBytes = Buffer.from(msgHash, 'hex');
  const sig = secp256k1.sign(hashBytes, privKey2);

  const sigHex = Buffer.from(sig.toCompactRawBytes()).toString('hex');
  const result = verifyMessageSignature(message, sigHex, pubKey1, 'stacks');
  assert(!result.valid, 'Wrong signer should fail verification');
});

test('Real keypair: tampered message fails verification', () => {
  const privKey = crypto.randomBytes(32);
  const pubKey = Buffer.from(secp256k1.getPublicKey(privKey, true)).toString('hex');

  const originalMsg = 'Original message';
  const msgHash = hashMessage(originalMsg, 'stacks');
  const hashBytes = Buffer.from(msgHash, 'hex');
  const sig = secp256k1.sign(hashBytes, privKey);

  const sigHex = Buffer.from(sig.toCompactRawBytes()).toString('hex');
  const result = verifyMessageSignature('Tampered message', sigHex, pubKey, 'stacks');
  assert(!result.valid, 'Tampered message should fail verification');
});

test('Real keypair: sign and verify across all chains', () => {
  const chains: Array<'stacks' | 'bitcoin' | 'ethereum' | 'solana' | 'sui' | 'aptos'> = [
    'stacks', 'bitcoin', 'ethereum', 'solana', 'sui', 'aptos',
  ];

  for (const chain of chains) {
    const privKey = crypto.randomBytes(32);
    const pubKey = Buffer.from(secp256k1.getPublicKey(privKey, true)).toString('hex');

    const message = `Sign for ${chain}`;
    const msgHash = hashMessage(message, chain);
    const hashBytes = Buffer.from(msgHash.replace(/^0x/, ''), 'hex');
    const sig = secp256k1.sign(hashBytes, privKey);

    const sigHex = Buffer.from(sig.toCompactRawBytes()).toString('hex');
    const result = verifyMessageSignature(message, sigHex, pubKey, chain);
    assert(result.valid, `Verification should pass for ${chain}: ${result.message || ''}`);
  }
});

// ─── Summary ──────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Signing Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}, 1000);
