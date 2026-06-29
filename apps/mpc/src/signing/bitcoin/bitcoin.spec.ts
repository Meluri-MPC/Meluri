/**
 * Bitcoin TSS Integration Tests — address derivation, message signing, tx signing
 *
 * Run: npx tsx src/signing/bitcoin/bitcoin.spec.ts
 */

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { DkgCoordinator } from '../../tss/dkg';
import {
  deriveP2PKHAddress,
  deriveP2WPKHAddress,
  deriveP2SHP2WPKHAddress,
  deriveBitcoinAddress,
  signBitcoinTransaction,
  signBitcoinMessage,
  bitcoinMessageHash,
  verifyBitcoinSignature,
  publicKeyToBitcoinFormat,
  hash256,
  hash160,
  SIGHASH_ALL,
  type BitcoinAddress,
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
  console.log('  Bitcoin TSS Integration Tests');
  console.log('\u2550'.repeat(62) + '\n');

  // Setup: DKG to get TSS shares
  const dkg = new DkgCoordinator('btc-test-dkg');
  const result = dkg.runFullDkg();
  const { publicKey, shares } = result;
  const publicKeyHex = Buffer.from(publicKey).toString('hex');

  // ── Address Derivation ──────────────────────────────────────────────
  console.log('\u2500'.repeat(62));
  console.log('Address Derivation');
  console.log('\u2500'.repeat(62));

  test('P2PKH mainnet address derivation', () => {
    const addr = deriveP2PKHAddress(publicKey, 'mainnet');
    assert(addr.startsWith('1'), `P2PKH mainnet should start with 1, got: ${addr}`);
    assert(addr.length >= 33 && addr.length <= 35, `P2PKH mainnet should be 33-35 chars, got ${addr.length}: ${addr}`);
  });

  test('P2PKH testnet address derivation', () => {
    const addr = deriveP2PKHAddress(publicKey, 'testnet');
    assert(addr.startsWith('m') || addr.startsWith('n'), `P2PKH testnet should start with m/n, got: ${addr}`);
    assert(addr.length === 34, `P2PKH testnet should be 34 chars, got ${addr.length}: ${addr}`);
  });

  test('P2WPKH mainnet address derivation', () => {
    const addr = deriveP2WPKHAddress(publicKey, 'mainnet');
    assert(addr.startsWith('bc1q'), `P2WPKH mainnet should start with bc1q, got: ${addr}`);
    assert(addr.length === 42, `P2WPKH mainnet should be 42 chars, got ${addr.length}: ${addr}`);
  });

  test('P2WPKH testnet address derivation', () => {
    const addr = deriveP2WPKHAddress(publicKey, 'testnet');
    assert(addr.startsWith('tb1q'), `P2WPKH testnet should start with tb1q, got: ${addr}`);
    assert(addr.length === 42, `P2WPKH testnet should be 42 chars, got ${addr.length}: ${addr}`);
  });

  test('P2SH-P2WPKH mainnet address derivation', () => {
    const addr = deriveP2SHP2WPKHAddress(publicKey, 'mainnet');
    assert(addr.startsWith('3'), `P2SH-P2WPKH mainnet should start with 3, got: ${addr}`);
    assert(addr.length === 34, `P2SH-P2WPKH mainnet should be 34 chars, got ${addr.length}: ${addr}`);
  });

  test('P2SH-P2WPKH testnet address derivation', () => {
    const addr = deriveP2SHP2WPKHAddress(publicKey, 'testnet');
    assert(addr.startsWith('2'), `P2SH-P2WPKH testnet should start with 2, got: ${addr}`);
    assert(addr.length >= 34 && addr.length <= 35, `P2SH-P2WPKH testnet should be 34-35 chars, got ${addr.length}: ${addr}`);
  });

  test('deriveBitcoinAddress default (SegWit)', () => {
    const addr = deriveBitcoinAddress(publicKey, 'mainnet');
    assert(addr.type === 'p2wpkh', 'Default type should be p2wpkh');
    assert(addr.address.startsWith('bc1q'), 'Default should be SegWit');
    assert(addr.network === 'mainnet', 'Network should be mainnet');
    assert(addr.publicKey === publicKeyHex, 'Public key should match');
  });

  test('Addresses are deterministic from same pubkey', () => {
    const addr1 = deriveP2WPKHAddress(publicKey, 'mainnet');
    const addr2 = deriveP2WPKHAddress(publicKey, 'mainnet');
    assert(addr1 === addr2, 'Same pubkey should produce same address');
  });

  test('Different pubkeys produce different addresses', () => {
    const dkg2 = new DkgCoordinator('btc-diff-key');
    const result2 = dkg2.runFullDkg();
    const addr1 = deriveP2WPKHAddress(publicKey, 'mainnet');
    const addr2 = deriveP2WPKHAddress(result2.publicKey, 'mainnet');
    assert(addr1 !== addr2, 'Different pubkeys should produce different addresses');
  });

  // ── Transaction Signing ──────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('Transaction Signing');
  console.log('\u2500'.repeat(62));

  test('Bitcoin transaction signing produces valid sig', () => {
    // Simulate a Bitcoin sighash (double-SHA256 of serialized tx)
    const txData = Uint8Array.from(Buffer.from('fake-bitcoin-tx-data'));
    const sighash = hash256(txData);

    const sig = signBitcoinTransaction(
      sighash,
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
      SIGHASH_ALL,
    );

    assert(sig.r > 0n, 'r should not be zero');
    assert(sig.s > 0n, 's should not be zero');
    assert(sig.sighashType === SIGHASH_ALL, `Sighash type should be 0x01, got 0x${sig.sighashType.toString(16)}`);
    assert(sig.der.length > 0, 'DER signature should not be empty');

    // Verify
    const valid = verifyBitcoinSignature(publicKeyHex, sighash, { r: sig.r, s: sig.s });
    assert(valid, 'Bitcoin signature did not verify');
  });

  test('Bitcoin signature hex ends with sighash byte', () => {
    const sighash = hash256(Uint8Array.from(Buffer.from('test-tx')));
    const sig = signBitcoinTransaction(
      sighash,
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
      SIGHASH_ALL,
    );

    assert(sig.hex.endsWith('01'), `Signature should end with sighash byte 01, got: ${sig.hex.slice(-2)}`);
  });

  test('Bitcoin signature verification rejects wrong key', () => {
    const dkg2 = new DkgCoordinator('btc-wrong-key');
    const result2 = dkg2.runFullDkg();
    const wrongKeyHex = Buffer.from(result2.publicKey).toString('hex');
    const sighash = hash256(Uint8Array.from(Buffer.from('test')));

    const sig = signBitcoinTransaction(
      sighash,
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
    );

    const valid = verifyBitcoinSignature(wrongKeyHex, sighash, { r: sig.r, s: sig.s });
    assert(!valid, 'Wrong key should reject signature');
  });

  // ── Message Signing ──────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('Message Signing');
  console.log('\u2500'.repeat(62));

  test('Bitcoin message signing produces valid sig', () => {
    const message = 'Hello from TSS Bitcoin!';
    const sig = signBitcoinMessage(
      message,
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
    );

    assert(sig.r > 0n, 'r should not be zero');
    assert(sig.der.length > 0, 'DER should not be empty');

    const msghash = bitcoinMessageHash(message);
    const valid = verifyBitcoinSignature(publicKeyHex, msghash, { r: sig.r, s: sig.s });
    assert(valid, 'Bitcoin message signature did not verify');
  });

  test('Bitcoin message hash is deterministic', () => {
    const hash1 = bitcoinMessageHash('hello');
    const hash2 = bitcoinMessageHash('hello');
    assert(
      Buffer.compare(Buffer.from(hash1), Buffer.from(hash2)) === 0,
      'Same message should produce same hash',
    );
  });

  test('Bitcoin message hash is different for different messages', () => {
    const hash1 = bitcoinMessageHash('hello');
    const hash2 = bitcoinMessageHash('world');
    assert(
      Buffer.compare(Buffer.from(hash1), Buffer.from(hash2)) !== 0,
      'Different messages should produce different hashes',
    );
  });

  // ─── Utility ─────────────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('Utility Functions');
  console.log('\u2500'.repeat(62));

  test('hash256 is double-SHA256', () => {
    const data = Uint8Array.from(Buffer.from('test'));
    const h = hash256(data);
    assert(h.length === 32, `hash256 should return 32 bytes, got ${h.length}`);
  });

  test('hash160 is SHA256 + RIPEMD160', () => {
    const data = Uint8Array.from(Buffer.from('test'));
    const h = hash160(data);
    assert(h.length === 20, `hash160 should return 20 bytes, got ${h.length}`);
  });

  test('publicKeyToBitcoinFormat returns compressed pubkey', () => {
    const hex = publicKeyToBitcoinFormat(publicKey);
    assert(hex.length === 66, `Compressed pubkey should be 66 hex chars, got ${hex.length}`);
    assert(hex.startsWith('02') || hex.startsWith('03'), `Should start with 02 or 03, got: ${hex.slice(0, 2)}`);
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
      deriveBitcoinAddress(publicKey, 'mainnet');
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / runs;
    console.log(`    P2WPKH derivation avg: ${avg.toFixed(2)}ms (${runs} runs)`);
    assert(avg < 5, `Address derivation too slow: ${avg.toFixed(2)}ms`);
  });

  test('Signing performance baseline', () => {
    const sighash = hash256(Uint8Array.from(Buffer.from('perf')));
    const runs = 50;
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      signBitcoinTransaction(
        sighash,
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
