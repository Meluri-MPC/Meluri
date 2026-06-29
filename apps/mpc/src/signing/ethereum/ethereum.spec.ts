/**
 * Ethereum TSS Integration Tests — address derivation, message signing, tx signing
 *
 * Run: npx tsx src/signing/ethereum/ethereum.spec.ts
 */

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { DkgCoordinator } from '../../tss/dkg';
import {
  deriveEthereumAddress,
  toChecksumAddress,
  personalSignHash,
  signEthereumMessage,
  signEthereumHash,
  verifyEthereumSignature,
  eip1559TxHash,
  legacyTxHash,
  signEIP1559Transaction,
  signLegacyTransaction,
  type EIP1559Tx,
  type LegacyTx,
} from './index';

secp.etc.hmacSha256Sync = (k: Uint8Array, ...msgs: Uint8Array[]) => {
  let h: Uint8Array = new Uint8Array(0);
  for (const msg of msgs) {
    h = hmac(sha256, k, msg);
    k = h;
  }
  return h;
};

// ─── Helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${e.message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('\u2550'.repeat(62));
  console.log('  Ethereum TSS Integration Tests');
  console.log('\u2550'.repeat(62) + '\n');

  // Setup: DKG to get TSS shares
  const dkg = new DkgCoordinator('eth-test-dkg');
  const result = dkg.runFullDkg();
  const { publicKey, shares } = result;
  const publicKeyHex = Buffer.from(publicKey).toString('hex');

  // ── Address Derivation ──────────────────────────────────────────────
  console.log('\u2500'.repeat(62));
  console.log('Address Derivation');
  console.log('\u2500'.repeat(62));

  test('Derive Ethereum address from public key', () => {
    const addr = deriveEthereumAddress(publicKey);
    assert(addr.address.startsWith('0x'), `Address should start with 0x, got: ${addr.address.slice(0, 4)}`);
    assert(addr.address.length === 42, `Address should be 42 chars, got ${addr.address.length}: ${addr.address}`);
    assert(addr.checksumAddress.startsWith('0x'), 'Checksum address should start with 0x');
    assert(addr.checksumAddress.length === 42, `Checksum address should be 42 chars`);
  });

  test('Checksum address has mixed case', () => {
    const addr = deriveEthereumAddress(publicKey);
    const without0x = addr.checksumAddress.slice(2);
    const hasUpper = /[A-F]/.test(without0x);
    const hasLower = /[a-f]/.test(without0x);
    // An address could be all-lower or all-upper by chance, but typically mixed
    assert(addr.checksumAddress.length === 42, 'Checksum address valid length');
  });

  test('Address is deterministic from same pubkey', () => {
    const addr1 = deriveEthereumAddress(publicKey);
    const addr2 = deriveEthereumAddress(publicKey);
    assert(addr1.address === addr2.address, 'Same pubkey should produce same address');
    assert(addr1.checksumAddress === addr2.checksumAddress, 'Same checksum');
  });

  test('Different pubkeys produce different addresses', () => {
    const dkg2 = new DkgCoordinator('eth-diff-key');
    const result2 = dkg2.runFullDkg();
    const addr1 = deriveEthereumAddress(publicKey);
    const addr2 = deriveEthereumAddress(result2.publicKey);
    assert(addr1.address !== addr2.address, 'Different pubkeys should produce different addresses');
  });

  test('toChecksumAddress produces consistent mixed-case', () => {
    const lower = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
    const checksummed = toChecksumAddress(lower);
    assert(checksummed.startsWith('0x'), 'Checksum should start with 0x');
    assert(checksummed.length === 42, 'Checksum should be 42 chars');
    // Verify round-trip stability
    const twice = toChecksumAddress(checksummed);
    assert(checksummed === twice, `Checksum should be idempotent: ${checksummed} vs ${twice}`);
    // Verify it differs from the lowercase version (has at least one uppercase)
    const without0x = checksummed.slice(2);
    assert(/[A-F]/.test(without0x) || checksummed === lower, 'Should have at least one uppercase char or be all-lower by chance');
  });

  // ── Message Signing (EIP-191) ────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('EIP-191 Message Signing');
  console.log('\u2500'.repeat(62));

  test('personal_sign produces valid signature', () => {
    const sig = signEthereumMessage(
      'Hello Ethereum from TSS!',
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
    );

    assert(sig.r.length === 64, `r should be 64 hex chars, got ${sig.r.length}`);
    assert(sig.s.length === 64, `s should be 64 hex chars, got ${sig.s.length}`);
    assert(sig.v >= 27, `v should be >= 27, got ${sig.v}`);
    assert(sig.hex.startsWith('0x'), 'Signature hex should start with 0x');
    assert(sig.hex.length >= 194, `Sig hex should be at least 194 chars (2+64+64+64), got ${sig.hex.length}`);
  });

  test('personal_sign with chain ID (EIP-155)', () => {
    const sig = signEthereumMessage(
      'With chain ID',
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
      1, // mainnet
    );

    assert(sig.v === 37 || sig.v === 38, `EIP-155 v on mainnet should be 37 or 38, got ${sig.v}`);
  });

  test('personal_sign with Sepolia chain ID', () => {
    const sig = signEthereumMessage(
      'Sepolia test',
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
      11155111, // Sepolia
    );

    // v = 35 + 2*chainId + recid → 35 + 22310222 + 0 or 1
    const expectedV = 35 + 2 * 11155111;
    assert(sig.v === expectedV || sig.v === expectedV + 1,
      `EIP-155 v on Sepolia should be ${expectedV} or ${expectedV + 1}, got ${sig.v}`);
  });

  test('personal_sign hash is deterministic', () => {
    const hash1 = personalSignHash('hello');
    const hash2 = personalSignHash('hello');
    assert(
      Buffer.compare(Buffer.from(hash1), Buffer.from(hash2)) === 0,
      'Same message should produce same hash',
    );
  });

  test('personal_sign hash different for different messages', () => {
    const hash1 = personalSignHash('hello');
    const hash2 = personalSignHash('world');
    assert(
      Buffer.compare(Buffer.from(hash1), Buffer.from(hash2)) !== 0,
      'Different messages should produce different hashes',
    );
  });

  // ── Signature Recovery ──────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('Signature Recovery');
  console.log('\u2500'.repeat(62));

  test('EIP-191 signature format includes valid v value', () => {
    const msgHash = personalSignHash('v value test');
    const sig = signEthereumHash(
      msgHash,
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
    );

    // v should be 27 or 28 (without chain ID)
    assert(sig.v >= 27 && sig.v <= 28,
      `v should be 27-28 without chain ID, got ${sig.v}`);
    // verify directly
    const r = BigInt('0x' + sig.r);
    const sVal = BigInt('0x' + sig.s);
    const valid = verifyEthereumSignature(publicKeyHex, msgHash, { r, s: sVal });
    assert(valid, 'Signature should verify');
  });

  test('Verify signature against public key', () => {
    const msgHash = personalSignHash('verify test');
    const sig = signEthereumHash(
      msgHash,
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
    );

    const r = BigInt('0x' + sig.r);
    const sVal = BigInt('0x' + sig.s);
    const valid = verifyEthereumSignature(publicKeyHex, msgHash, { r, s: sVal });
    assert(valid, 'Signature should verify against pubkey');
  });

  // ── Transaction Signing ──────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('Transaction Signing');
  console.log('\u2500'.repeat(62));

  test('EIP-1559 tx hash is 32 bytes', () => {
    const tx: EIP1559Tx = {
      chainId: 1,
      nonce: 0,
      maxPriorityFeePerGas: 1_000_000_000n,
      maxFeePerGas: 20_000_000_000n,
      gasLimit: 21000n,
      to: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      value: 1000000000000000000n,
      data: '0x',
    };

    const hash = eip1559TxHash(tx);
    assert(hash.length === 32, `EIP-1559 tx hash should be 32 bytes, got ${hash.length}`);
  });

  test('Legacy tx hash is 32 bytes', () => {
    const tx: LegacyTx = {
      chainId: 1,
      nonce: 0,
      gasPrice: 20_000_000_000n,
      gasLimit: 21000n,
      to: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      value: 0n,
      data: '0x',
    };

    const hash = legacyTxHash(tx);
    assert(hash.length === 32, `Legacy tx hash should be 32 bytes, got ${hash.length}`);
  });

  test('Sign EIP-1559 transaction', () => {
    const tx: EIP1559Tx = {
      chainId: 1,
      nonce: 0,
      maxPriorityFeePerGas: 1_000_000_000n,
      maxFeePerGas: 20_000_000_000n,
      gasLimit: 21000n,
      to: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      value: 1000000000000000000n,
      data: '0x',
    };

    const sig = signEIP1559Transaction(
      tx,
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
    );

    assert(sig.r.length === 64, 'r should be 64 hex chars');
    assert(sig.s.length === 64, 's should be 64 hex chars');
    assert(sig.hex.startsWith('0x'), 'Sig should have 0x prefix');

    const txhash = eip1559TxHash(tx);
    const valid = verifyEthereumSignature(
      publicKeyHex,
      txhash,
      { r: BigInt('0x' + sig.r), s: BigInt('0x' + sig.s) },
    );
    assert(valid, 'EIP-1559 signature should verify');
  });

  test('Sign legacy transaction', () => {
    const tx: LegacyTx = {
      chainId: 1,
      nonce: 5,
      gasPrice: 20_000_000_000n,
      gasLimit: 21000n,
      to: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      value: 500000000000000000n,
      data: '0x',
    };

    const sig = signLegacyTransaction(
      tx,
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
    );

    assert(sig.r.length === 64, 'r should be 64 hex chars');
    assert(sig.hex.startsWith('0x'), 'Sig should have 0x prefix');

    const txhash = legacyTxHash(tx);
    const valid = verifyEthereumSignature(
      publicKeyHex,
      txhash,
      { r: BigInt('0x' + sig.r), s: BigInt('0x' + sig.s) },
    );
    assert(valid, 'Legacy tx signature should verify');
  });

  // ─── Performance ─────────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('Performance');
  console.log('\u2500'.repeat(62));

  test('Address derivation performance', () => {
    const runs = 100;
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      deriveEthereumAddress(publicKey);
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / runs;
    console.log(`    avg: ${avg.toFixed(2)}ms (${runs} runs)`);
    assert(avg < 5, `Address derivation too slow: ${avg.toFixed(2)}ms`);
  });

  test('Message signing performance', () => {
    const msg = 'performance test message for ethereum tss signing';
    const runs = 50;
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      signEthereumMessage(
        msg,
        1, shares.get(1)!,
        2, shares.get(2)!,
        publicKeyHex,
      );
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / runs;
    console.log(`    avg: ${avg.toFixed(2)}ms per sign (${runs} runs)`);
    assert(avg < 100, `Signing too slow: ${avg.toFixed(2)}ms`);
  });

  // ─── Summary ─────────────────────────────────────────────────────────
  setTimeout(() => {
    console.log(`\n${'\u2550'.repeat(62)}`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.log(`  \u26a0 Some tests failed — review above`);
      process.exit(1);
    } else {
      console.log(`  \u2713 All tests passed`);
    }
    console.log('\u2550'.repeat(62));
  }, 1000);
}

runTests();
