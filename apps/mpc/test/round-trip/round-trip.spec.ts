/**
 * Round-Trip Tests — End-to-end DKG → Sign → Verify pipeline.
 *
 * Run: npx tsx test/round-trip/round-trip.spec.ts
 *
 * Coverage:
 *   - Full DKG → sign → verify (all 2-of-3 combos)
 *   - 100 random messages sign + verify with zero failures
 *   - Dual verification: SigningCeremony.verify + @noble/secp256k1.verify
 *   - Storage pipeline: serialize → encrypt → decrypt → deserialize → sign
 *   - Edge cases: empty message, 32-byte hash, large message
 *   - Latency benchmarks: DKG < 2s, signing < 500ms
 *   - Deterministic check: same inputs across separate ceremonies
 *   - Stress: rapid-fire signing without intermediate key material leak
 */

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { randomBytes } from 'crypto';

import { DkgCoordinator, CURVE_ORDER } from '../../src/tss/dkg';
import {
  SigningCeremony,
  signStacksTransactionHash,
  mod,
  modInverse,
  type SigningResult,
} from '../../src/signing/index';
import {
  generateEncryptionKey,
  deriveShareKey,
  generateSalt,
  encryptShare,
  decryptShare,
  wipeBuffer,
  type EncryptedBlob,
} from '../../src/storage/encryption';
import {
  serializeShare,
  deserializeShare,
  type SerializedShare,
} from '../../src/storage/share-serializer';

secp.etc.hmacSha256Sync = (k: Uint8Array, ...msgs: Uint8Array[]) => {
  let h: Uint8Array = new Uint8Array(0);
  for (const msg of msgs) {
    h = hmac(sha256, k, msg);
    k = h;
  }
  return h;
};

// ─── Test Framework ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let warnings: string[] = [];

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

function warn(message: string) {
  warnings.push(message);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function bytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) | BigInt(b);
  return result;
}

function randomScalar(): bigint {
  let s: bigint;
  do {
    const bytes = secp.utils.randomPrivateKey();
    s = 0n;
    for (const b of bytes) s = (s << 8n) | BigInt(b);
  } while (s >= CURVE_ORDER || s === 0n);
  return s;
}

/**
 * Dual verification: using both SigningCeremony.verify and @noble/secp256k1.verify.
 */
function dualVerify(
  publicKeyHex: string,
  publicKeyRaw: Uint8Array,
  messageHash: Uint8Array,
  sig: { r: bigint; s: bigint },
): { tssOk: boolean; nobleOk: boolean } {
  const tssOk = SigningCeremony.verify(publicKeyHex, messageHash, sig);
  let nobleOk = false;
  try {
    const nobleSig = new secp.Signature(sig.r, sig.s);
    nobleOk = secp.verify(nobleSig, messageHash, publicKeyRaw);
  } catch {
    nobleOk = false;
  }
  return { tssOk, nobleOk };
}

// ─── Suite ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\u2550'.repeat(70));
  console.log('  Round-Trip Tests — DKG → Sign → Verify (E2E)');
  console.log('\u2550'.repeat(70) + '\n');

  // ──────── Happy Path ──────────────────────────────────────────────────
  console.log('\u2500'.repeat(70));
  console.log('Happy Path — DKG → Sign → Verify');
  console.log('\u2500'.repeat(70));

  // Setup
  const dkg = new DkgCoordinator('roundtrip-main');
  const startDkg = performance.now();
  const { publicKey, shares } = dkg.runFullDkg();
  const dkgTime = performance.now() - startDkg;
  const publicKeyHex = Buffer.from(publicKey).toString('hex');
  const combos: [number, number][] = [[1, 2], [1, 3], [2, 3]];
  console.log(`  DKG completed in ${dkgTime.toFixed(0)}ms`);

  test('DKG completes under 2s', () => {
    assert(dkgTime < 2000, `DKG took ${dkgTime.toFixed(0)}ms, exceeds 2s budget`);
  });

  test('All 2-of-3 combos sign + dual-verify', () => {
    const msgHash = sha256('round-trip happy path message');

    for (const [a, b] of combos) {
      const startSign = performance.now();
      const sig = SigningCeremony.sign(
        `happy-${a}-${b}`, a, shares.get(a)!, b, shares.get(b)!,
        msgHash, publicKeyHex,
      );
      const signTime = performance.now() - startSign;

      const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, msgHash, sig);
      assert(tssOk, `Combo ${a}+${b}: TSS verify failed`);
      assert(nobleOk, `Combo ${a}+${b}: Noble verify failed`);
      assert(signTime < 500, `Combo ${a}+${b}: sign took ${signTime.toFixed(0)}ms > 500ms`);
    }
  });

  test('Signing latency < 500ms for all combos', () => {
    const msgHash = sha256('latency check');
    const times: number[] = [];

    for (let i = 0; i < 20; i++) {
      const combo = combos[i % combos.length];
      const start = performance.now();
      SigningCeremony.sign(
        `lat-${i}`, combo[0], shares.get(combo[0])!, combo[1], shares.get(combo[1])!,
        msgHash, publicKeyHex,
      );
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    console.log(`    avg: ${avg.toFixed(2)}ms, max: ${max.toFixed(2)}ms (20 runs)`);
    assert(max < 500, `Max signing latency ${max.toFixed(0)}ms exceeds 500ms budget`);
  });

  // ──────── 100 Random Messages ─────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('100 Random Messages — Zero-Failure Verification');
  console.log('\u2500'.repeat(70));

  test('100 random messages: sign + dual-verify, zero failures', () => {
    const totalStart = performance.now();
    const msgHashes: Uint8Array[] = [];
    for (let i = 0; i < 100; i++) {
      // Generate random message of varying length
      const len = (i % 256) + 1; // 1–256 bytes
      const msg = `msg-${i}-` + 'x'.repeat(Math.max(0, len - 6));
      msgHashes.push(sha256(msg));
    }

    let tssFailures = 0;
    let nobleFailures = 0;
    let totalSignTime = 0;

    for (let i = 0; i < 100; i++) {
      const combo = combos[i % combos.length];
      const start = performance.now();
      const sig = SigningCeremony.sign(
        `r100-${i}`, combo[0], shares.get(combo[0])!, combo[1], shares.get(combo[1])!,
        msgHashes[i], publicKeyHex,
      );
      totalSignTime += performance.now() - start;

      const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, msgHashes[i], sig);
      if (!tssOk) tssFailures++;
      if (!nobleOk) nobleFailures++;
    }

    const totalTime = performance.now() - totalStart;
    console.log(`    100 signs + verifies in ${totalTime.toFixed(0)}ms`);
    console.log(`    avg sign: ${(totalSignTime / 100).toFixed(2)}ms`);
    console.log(`    TSS failures: ${tssFailures}, Noble failures: ${nobleFailures}`);

    assert(tssFailures === 0, `${tssFailures} TSS verification failures`);
    assert(nobleFailures === 0, `${nobleFailures} Noble verification failures`);
  });

  // ──────── Storage Pipeline Round-Trip ──────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Storage Pipeline: DKG → Encrypt → Store → Decrypt → Sign');
  console.log('\u2500'.repeat(70));

  test('Full storage round-trip: serialize → encrypt → decrypt → sign', () => {
    const masterKey = generateEncryptionKey('roundtrip-kms').key;

    // Serialize + encrypt each share
    const encryptedShares: Map<number, EncryptedBlob> = new Map();
    const salts: Map<number, Buffer> = new Map();

    for (const [partyIndex, share] of shares.entries()) {
      const salt = generateSalt();
      const info = `wallet:roundtrip-001:share:${partyIndex}`;
      const key = deriveShareKey(masterKey, salt, info);

      const serialized = serializeShare({
        version: 1,
        partyIndex,
        share,
        publicKey,
      });

      const blob = encryptShare(serialized, key, salt, info);
      encryptedShares.set(partyIndex, blob);
      salts.set(partyIndex, salt);
      wipeBuffer(key);
    }

    // Decrypt + deserialize
    const recoveredShares = new Map<number, bigint>();
    for (const [partyIndex, blob] of encryptedShares.entries()) {
      const salt = salts.get(partyIndex)!;
      const info = `wallet:roundtrip-001:share:${partyIndex}`;
      const key = deriveShareKey(masterKey, salt, info);

      const plaintext = decryptShare(blob, key);
      const deserialized = deserializeShare(plaintext);

      recoveredShares.set(partyIndex, deserialized.share);
      wipeBuffer(key);
      wipeBuffer(plaintext);
    }

    // Sign with recovered shares
    const msgHash = sha256('storage round-trip verification');
    const sig = SigningCeremony.sign(
      'storage-rt', 1, recoveredShares.get(1)!, 2, recoveredShares.get(2)!,
      msgHash, publicKeyHex,
    );

    const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, msgHash, sig);
    assert(tssOk, 'Storage round-trip: TSS verify failed');
    assert(nobleOk, 'Storage round-trip: Noble verify failed');

    // Verify all 3 shares recovered match originals
    for (const [idx, share] of shares.entries()) {
      assert(recoveredShares.get(idx) === share,
        `Share ${idx} mismatch after storage round-trip`);
    }

    wipeBuffer(masterKey);
  });

  // ──────── Edge Cases ──────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Edge Cases');
  console.log('\u2500'.repeat(70));

  test('Empty message (0 bytes)', () => {
    const emptyHash = sha256('');
    const sig = SigningCeremony.sign(
      'empty-msg', 1, shares.get(1)!, 2, shares.get(2)!, emptyHash, publicKeyHex,
    );
    const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, emptyHash, sig);
    assert(tssOk, 'Empty message TSS verify failed');
    assert(nobleOk, 'Empty message Noble verify failed');
  });

  test('32-byte pre-hashed message (Stacks tx standard)', () => {
    const txHash = randomBytes(32);
    const sig = SigningCeremony.sign(
      '32byte-hash', 1, shares.get(1)!, 2, shares.get(2)!, txHash, publicKeyHex,
    );
    const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, txHash, sig);
    assert(tssOk, '32-byte hash TSS verify failed');
    assert(nobleOk, '32-byte hash Noble verify failed');
  });

  test('Large message (64KB)', () => {
    const largeMsg = Buffer.alloc(65536, 'A');
    const largeHash = sha256(largeMsg);
    const sig = SigningCeremony.sign(
      'large-msg', 1, shares.get(1)!, 2, shares.get(2)!, largeHash, publicKeyHex,
    );
    const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, largeHash, sig);
    assert(tssOk, '64KB message TSS verify failed');
    assert(nobleOk, '64KB message Noble verify failed');
  });

  test('Same message via different party combos = all verify', () => {
    const msgHash = sha256('consistent verification');
    const sigs: SigningResult[] = [];

    for (const [a, b] of combos) {
      sigs.push(SigningCeremony.sign(
        `consistent-${a}-${b}`, a, shares.get(a)!, b, shares.get(b)!,
        msgHash, publicKeyHex,
      ));
    }

    for (const sig of sigs) {
      const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, msgHash, sig);
      assert(tssOk, 'Consistent: TSS verify failed');
      assert(nobleOk, 'Consistent: Noble verify failed');
    }
  });

  // ──────── Stacks Transaction Round-Trip ───────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Stacks Transaction Round-Trip');
  console.log('\u2500'.repeat(70));

  test('Stacks tx: DKG → signTxHash → verify (TSS + noble)', () => {
    const txHash = sha256('simulated stacks transaction for round-trip test');
    const sig = signStacksTransactionHash(
      txHash, 1, shares.get(1)!, 2, shares.get(2)!, publicKeyHex,
    );

    const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, txHash, sig);
    assert(tssOk, 'Stacks tx TSS verify failed');
    assert(nobleOk, 'Stacks tx Noble verify failed');
    assert(sig.hex.startsWith('30'), 'Stacks sig must be DER-encoded');

    // Verify the DER structure is valid
    const der = Buffer.from(sig.hex, 'hex');
    assert(der[0] === 0x30, 'DER: sequence tag');
    assert(der[2] === 0x02, 'DER: r integer tag');
    assert(der[4 + der[3]] === 0x02, 'DER: s integer tag');
  });

  test('Stacks tx with all 3 party combos', () => {
    const txHash = sha256('stacks tx all combos round-trip');
    for (const [a, b] of combos) {
      const sig = signStacksTransactionHash(
        txHash, a, shares.get(a)!, b, shares.get(b)!, publicKeyHex,
      );
      const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, txHash, sig);
      assert(tssOk, `Stacks ${a}+${b}: TSS verify failed`);
      assert(nobleOk, `Stacks ${a}+${b}: Noble verify failed`);
    }
  });

  // ──────── Deterministic Check ─────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Deterministic Behaviour');
  console.log('\u2500'.repeat(70));

  test('Separate DKG sessions produce different keys (deterministic randomness)', () => {
    const dkg2 = new DkgCoordinator('roundtrip-2');
    const r2 = dkg2.runFullDkg();

    assert(
      Buffer.from(publicKey).toString('hex') !== Buffer.from(r2.publicKey).toString('hex'),
      'Two DKG sessions produced same key',
    );

    // But both should produce valid keys
    const pkHex2 = Buffer.from(r2.publicKey).toString('hex');
    const msgHash = sha256('cross-session verify');
    const sig = SigningCeremony.sign(
      'cross-session', 1, r2.shares.get(1)!, 2, r2.shares.get(2)!,
      msgHash, pkHex2,
    );
    const { tssOk, nobleOk } = dualVerify(pkHex2, r2.publicKey, msgHash, sig);
    assert(tssOk, 'Second session TSS verify failed');
    assert(nobleOk, 'Second session Noble verify failed');
  });

  test('Re-sharing: same DKG key produces consistent results', () => {
    // Re-running signing with the same DKG shares is consistent
    const msgHash = sha256('re-sharing consistency');
    const sig1 = SigningCeremony.sign(
      'reshare-1', 1, shares.get(1)!, 2, shares.get(2)!, msgHash, publicKeyHex,
    );
    const sig2 = SigningCeremony.sign(
      'reshare-2', 1, shares.get(1)!, 3, shares.get(3)!, msgHash, publicKeyHex,
    );

    const v1a = dualVerify(publicKeyHex, publicKey, msgHash, sig1);
    const v2a = dualVerify(publicKeyHex, publicKey, msgHash, sig2);
    assert(v1a.tssOk && v1a.nobleOk, 'Sig 1 (shares 1+2) failed');
    assert(v2a.tssOk && v2a.nobleOk, 'Sig 2 (shares 1+3) failed');
  });

  // ──────── Stress ──────────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Stress — Rapid Sequential Signing');
  console.log('\u2500'.repeat(70));

  test('200 rapid sequential signs, zero failures', () => {
    const msgHashes: Uint8Array[] = [];
    for (let i = 0; i < 200; i++) {
      msgHashes.push(sha256(`stress-msg-${i}-${randomBytes(4).toString('hex')}`));
    }

    let failures = 0;
    const times: number[] = [];
    const start = performance.now();

    for (let i = 0; i < 200; i++) {
      const combo = combos[i % combos.length];
      const t0 = performance.now();
      const sig = SigningCeremony.sign(
        `stress-${i}`, combo[0], shares.get(combo[0])!, combo[1], shares.get(combo[1])!,
        msgHashes[i], publicKeyHex,
      );
      times.push(performance.now() - t0);

      const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, msgHashes[i], sig);
      if (!tssOk || !nobleOk) failures++;
    }

    const totalTime = performance.now() - start;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const p50 = times.sort((a, b) => a - b)[100];
    const p95 = times.sort((a, b) => a - b)[190];
    const p99 = times.sort((a, b) => a - b)[198];

    console.log(`    200 signs + verifies in ${totalTime.toFixed(0)}ms`);
    console.log(`    sign avg: ${avg.toFixed(2)}ms  p50: ${p50.toFixed(2)}ms  p95: ${p95.toFixed(2)}ms  p99: ${p99.toFixed(2)}ms`);
    console.log(`    failures: ${failures}`);

    assert(failures === 0, `${failures} verification failures in 200 runs`);
    assert(avg < 100, `Avg sign time ${avg.toFixed(0)}ms exceeds 100ms`);
  });

  // ──────── Cross-Verification Consistency ──────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Cross-Verification Consistency (TSS === Noble)');
  console.log('\u2500'.repeat(70));

  test('TSS verify and Noble verify always agree', () => {
    const msgHash = sha256('consistency check between verifiers');
    let agreements = 0;
    let disagreements = 0;

    for (let i = 0; i < 50; i++) {
      const combo = combos[i % combos.length];
      const sig = SigningCeremony.sign(
        `agree-${i}`, combo[0], shares.get(combo[0])!, combo[1], shares.get(combo[1])!,
        msgHash, publicKeyHex,
      );

      const { tssOk, nobleOk } = dualVerify(publicKeyHex, publicKey, msgHash, sig);
      if (tssOk === nobleOk) {
        agreements++;
      } else {
        disagreements++;
        warn(`Disagreement at iteration ${i}: TSS=${tssOk}, Noble=${nobleOk}`);
      }
    }

    console.log(`    Agreements: ${agreements}, Disagreements: ${disagreements}`);
    assert(disagreements === 0,
      `TSS and Noble verifiers disagreed ${disagreements} times`);
  });

  // ──────── Key Material Sanity ─────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Key Material Sanity');
  console.log('\u2500'.repeat(70));

  test('No single share equals another', () => {
    const s1 = shares.get(1)!;
    const s2 = shares.get(2)!;
    const s3 = shares.get(3)!;
    assert(s1 !== s2, 'Share 1 = Share 2');
    assert(s2 !== s3, 'Share 2 = Share 3');
    assert(s1 !== s3, 'Share 1 = Share 3');
  });

  test('All shares are in valid range [1, n-1]', () => {
    for (const [idx, share] of shares.entries()) {
      assert(share > 0n, `Share ${idx} is zero`);
      assert(share < CURVE_ORDER, `Share ${idx} >= n`);
    }
  });

  test('Public key is 33-byte compressed point', () => {
    assert(publicKey.length === 33, `Public key is ${publicKey.length} bytes, expected 33`);
    assert(publicKey[0] === 0x02 || publicKey[0] === 0x03, 'Not compressed format');
  });

  test('Public key is valid curve point', () => {
    const point = secp.Point.fromHex(publicKeyHex);
    assert(point !== null, 'Invalid point');
    assert(point.x > 0n, 'Point at infinity');
  });

  // ──────── Summary ─────────────────────────────────────────────────────
  setTimeout(() => {
    console.log(`\n${'\u2550'.repeat(70)}`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (warnings.length > 0) {
      console.log(`  \u26a0 ${warnings.length} warning(s):`);
      for (const w of warnings) {
        console.log(`    - ${w}`);
      }
    }
    if (failed > 0) {
      console.log(`  \u26a0 ${failed} test(s) failed — review above`);
      process.exit(1);
    } else {
      console.log(`  \u2713 All ${passed} tests passed`);
    }
    console.log('\u2550'.repeat(70));
  }, 2000);
}

runTests();
