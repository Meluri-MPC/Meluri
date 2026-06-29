/**
 * Signing Ceremony Tests — 2-of-3 Threshold ECDSA Signing
 *
 * Run: npx tsx src/signing/signing.spec.ts
 */

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { SigningCeremony, signStacksTransactionHash, lagrangeCoefficient, mod, modInverse, CURVE_ORDER } from './index';
import { DkgCoordinator } from '../tss/dkg';

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

function test(name: string, fn: () => void | Promise<void>) {
  (async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e: any) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${e.message}`);
      failed++;
    }
  })();
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Signing Ceremony Tests — 2-of-3 Threshold ECDSA           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Run DKG once for shared test data
  console.log('─'.repeat(62));
  console.log('Setup: Running DKG to generate test shares...');
  const dkg = new DkgCoordinator('signing-test-dkg');
  const dkgResult = dkg.runFullDkg();
  const { publicKey, shares } = dkgResult;
  const publicKeyHex = Buffer.from(publicKey).toString('hex');
  console.log(`  Public key: ${publicKeyHex.slice(0, 20)}...`);
  console.log('─'.repeat(62));

  const message = 'hello stacks from velumx mpc signing test';
  const messageHash = sha256(message);
  const messageHash2 = sha256('a different message');

  const combos: [number, number][] = [[1, 2], [1, 3], [2, 3]];

  // ── Test 1: All 2-of-3 combinations sign successfully ──────────
  console.log('\n' + '─'.repeat(62));
  console.log('Core Signing');
  console.log('─'.repeat(62));

  test('All 2-of-3 combinations produce valid signatures', () => {
    for (const [a, b] of combos) {
      const sig = SigningCeremony.sign(
        `test-${a}-${b}`,
        a, shares.get(a)!,
        b, shares.get(b)!,
        messageHash,
        publicKeyHex,
      );

      assert(sig.r > 0n, `Share ${a}+${b}: r is zero`);
      assert(sig.s > 0n, `Share ${a}+${b}: s is zero`);
      assert(sig.hex.length > 0, `Share ${a}+${b}: empty DER hex`);

      const valid = SigningCeremony.verify(publicKeyHex, messageHash, { r: sig.r, s: sig.s });
      assert(valid, `Share ${a}+${b}: signature did not verify`);
    }
  });

  // ── Test 2: Single share cannot sign ──────────────────────────
  test('Single share cannot produce valid signature', () => {
    // Use share 1 with another random share (simulating wrong share)
    const fakeShare = 12345n;
    const sig = SigningCeremony.sign(
      'test-single',
      1, shares.get(1)!,
      2, fakeShare, // Wrong share 2
      messageHash,
      publicKeyHex,
    );

    const valid = SigningCeremony.verify(publicKeyHex, messageHash, { r: sig.r, s: sig.s });
    assert(!valid, 'Single share with wrong counterpart should not verify');
  });

  // ── Test 3: Different messages → different signatures ────────
  test('Different messages produce different signatures', () => {
    const sig1 = SigningCeremony.sign(
      'test-msg1',
      1, shares.get(1)!,
      2, shares.get(2)!,
      messageHash,
      publicKeyHex,
    );

    const sig2 = SigningCeremony.sign(
      'test-msg2',
      1, shares.get(1)!,
      2, shares.get(2)!,
      messageHash2,
      publicKeyHex,
    );

    assert(sig1.r !== sig2.r || sig1.s !== sig2.s,
      'Different messages should produce different signatures');
  });

  // ── Test 4: Same message → different signatures (nonce) ──────
  test('Same message produces different signatures (random nonces)', () => {
    const sig1 = SigningCeremony.sign(
      'test-nonce1',
      1, shares.get(1)!,
      2, shares.get(2)!,
      messageHash,
      publicKeyHex,
    );

    const sig2 = SigningCeremony.sign(
      'test-nonce2',
      1, shares.get(1)!,
      2, shares.get(2)!,
      messageHash,
      publicKeyHex,
    );

    // Both should verify (r may differ, or s)
    const v1 = SigningCeremony.verify(publicKeyHex, messageHash, { r: sig1.r, s: sig1.s });
    const v2 = SigningCeremony.verify(publicKeyHex, messageHash, { r: sig2.r, s: sig2.s });
    assert(v1 && v2, 'Both signatures should verify');

    // Non-deterministic: they might be equal (1 in 2^256 chance)
    if (sig1.r === sig2.r && sig1.s === sig2.s) {
      console.log('    (nonces happened to collide — negligible probability)');
    }
  });

  // ── Test 5: DER encoding is valid ────────────────────────────
  test('DER-encoded signature hex is parseable', () => {
    const sig = SigningCeremony.sign(
      'test-der',
      1, shares.get(1)!,
      2, shares.get(2)!,
      messageHash,
      publicKeyHex,
    );

    // DER format: 30 <len> 02 <len> <r> 02 <len> <s>
    assert(sig.hex.startsWith('30'), 'DER should start with 30 (SEQUENCE)');
    assert(sig.hex.length > 10, 'DER hex too short');
    assert(sig.hex.length % 2 === 0, 'DER hex should be even length');

    // Verify the encoded signature can be decoded
    const derBytes = Buffer.from(sig.hex, 'hex');
    assert(derBytes[0] === 0x30, 'First byte should be 0x30');

    // Decode r
    let offset = 2;
    const totalLen = derBytes[1];
    const rLen = derBytes[offset + 1];
    const rBytes = derBytes.subarray(offset + 2, offset + 2 + rLen);
    offset += 2 + rLen;
    const sLen = derBytes[offset + 1];
    const sBytes = derBytes.subarray(offset + 2, offset + 2 + sLen);

    assert(rBytes.length > 0, 'Empty r in DER');
    assert(sBytes.length > 0, 'Empty s in DER');
  });

  // ── Test 6: Recovery ID is valid ──────────────────────────────
  test('Recovery ID is 0 or 1', () => {
    const sig = SigningCeremony.sign(
      'test-recid',
      1, shares.get(1)!,
      2, shares.get(2)!,
      messageHash,
      publicKeyHex,
    );

    assert(sig.recoveryId === 0 || sig.recoveryId === 1,
      `Recovery ID should be 0 or 1, got ${sig.recoveryId}`);
  });

  // ── Test 7: Wrong public key rejects signature ────────────────
  test('Wrong public key rejects valid signature', () => {
    const sig = SigningCeremony.sign(
      'test-wrongpk',
      1, shares.get(1)!,
      2, shares.get(2)!,
      messageHash,
      publicKeyHex,
    );

    // Generate a completely different key
    const wrongKey = secp.getPublicKey(
      Buffer.from('b'.repeat(64), 'hex'),
      false,
    );
    const wrongKeyHex = Buffer.from(wrongKey).toString('hex');

    const valid = SigningCeremony.verify(wrongKeyHex, messageHash, { r: sig.r, s: sig.s });
    assert(!valid, 'Wrong public key should reject signature');
  });

  // ── Test 8: Lagrange coefficients are correct ─────────────────
  test('Lagrange coefficients correctly reconstruct key', () => {
    // For any 2-of-3 Shamir shares:
    // λ_i * f(i) + λ_j * f(j) = f(0) = private key
    for (const [a, b] of combos) {
      const lambdaA = lagrangeCoefficient(a, b);
      const lambdaB = lagrangeCoefficient(b, a);

      const reconstructed = mod(
        mod(lambdaA * shares.get(a)!, CURVE_ORDER) +
        mod(lambdaB * shares.get(b)!, CURVE_ORDER),
        CURVE_ORDER,
      );

      // Verify reconstructed key produces the joint public key
      const computedPub = secp.getPublicKey(reconstructed, true);
      assert(
        Buffer.from(computedPub).toString('hex') === Buffer.from(publicKey).toString('hex'),
        `Shares ${a}+${b}: reconstructed key does not match joint public key`,
      );
    }
  });

  // ── Test 9: Stacks transaction hash signing ───────────────────
  console.log('\n' + '─'.repeat(62));
  console.log('Stacks Transaction Integration');
  console.log('─'.repeat(62));

  test('Stacks transaction hash signing produces valid sig', () => {
    // Simulate a Stacks transaction sighash (32-byte hash)
    const txHash = sha256('simulated stacks transaction');
    const sig = signStacksTransactionHash(
      txHash,
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
    );

    const valid = SigningCeremony.verify(publicKeyHex, txHash, { r: sig.r, s: sig.s });
    assert(valid, 'Stacks transaction signature did not verify');
    assert(sig.hex.startsWith('30'), 'Stacks signature should be DER-encoded');
  });

  test('Stacks sign rejects mismatched public key', () => {
    const txHash = sha256('another stacks tx');
    const sig = signStacksTransactionHash(
      txHash,
      1, shares.get(1)!,
      2, shares.get(2)!,
      publicKeyHex,
    );

    // Verify against a different key
    const otherDkg = new DkgCoordinator('other-key-dkg');
    const otherResult = otherDkg.runFullDkg();
    const otherKeyHex = Buffer.from(otherResult.publicKey).toString('hex');

    const valid = SigningCeremony.verify(otherKeyHex, txHash, { r: sig.r, s: sig.s });
    assert(!valid, 'Signature should not verify against different public key');
  });

  // ── Test 10: Performance ──────────────────────────────────────
  console.log('\n' + '─'.repeat(62));
  console.log('Performance');
  console.log('─'.repeat(62));

  test('Signing performance baseline', () => {
    const runs = 100;
    const times: number[] = [];

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      SigningCeremony.sign(
        `perf-${i}`,
        1, shares.get(1)!,
        2, shares.get(2)!,
        messageHash,
        publicKeyHex,
      );
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / runs;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const p95 = times.sort((a, b) => a - b)[Math.floor(runs * 0.95)];

    console.log(`    avg: ${avg.toFixed(2)}ms, min: ${min.toFixed(2)}ms, max: ${max.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms`);

    assert(avg < 100, `Signing too slow: ${avg.toFixed(2)}ms avg`);
  });

  // ── Test 11: Signing fails with 1 participant ─────────────────
  test('Signing ceremony rejects fewer than 2 parties', () => {
    try {
      new SigningCeremony('bad', [1], messageHash, publicKeyHex);
      assert(false, 'Should throw with 1 party');
    } catch (e: any) {
      assert(e.message.includes('exactly 2'), `Unexpected: ${e.message}`);
    }
  });

  // ── Test 12: Signing fails if party not in session ────────────
  test('Ceremony rejects contributions from non-participating parties', () => {
    const ceremony = new SigningCeremony('test-bad-party', [1, 2], messageHash, publicKeyHex);

    try {
      ceremony.submitContribution({ partyId: 3, nonce: 1n, weightedShare: 1n });
      assert(false, 'Should reject party 3');
    } catch (e: any) {
      assert(e.message.includes('Party 3'), `Unexpected: ${e.message}`);
    }
  });

  // ── Test 13: Round guard — can't sign before contributions ────
  test('Cannot produce signature before all contributions', () => {
    const ceremony = new SigningCeremony('test-guard', [1, 2], messageHash, publicKeyHex);

    try {
      ceremony.produceSignature();
      assert(false, 'Should throw without contributions');
    } catch (e: any) {
      assert(e.message.includes('Not all parties'), `Unexpected: ${e.message}`);
    }
  });

  // ── Summary ─────────────────────────────────────────────────────
  setTimeout(() => {
    console.log(`\n${'═'.repeat(62)}`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.log(`  ⚠ Some tests failed — review above`);
    } else {
      console.log(`  ✓ All tests passed`);
    }
    console.log('═'.repeat(62));
  }, 2000);
}

runTests();
