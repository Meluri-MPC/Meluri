/**
 * EdDSA (Ed25519) Tests — keygen, sign, verify
 *
 * Run: npx tsx src/signing/eddsa/eddsa.spec.ts
 */

import {
  generateEd25519Keypair,
  importEd25519Keypair,
  getEd25519PublicKey,
  signEd25519,
  verifyEd25519,
  generateEd25519Seed,
  type Ed25519Keypair,
} from './index';

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
  console.log('\u2554'.repeat(62));
  console.log('\u2551     EdDSA (Ed25519) Tests — Keygen, Sign, Verify              \u2551');
  console.log('\u255a'.repeat(62) + '\n');

  // ── Key Generation ──────────────────────────────────────────────────
  console.log('\u2500'.repeat(62));
  console.log('Key Generation');
  console.log('\u2500'.repeat(62));

  test('Generates valid 32-byte keypair', () => {
    const kp = generateEd25519Keypair();
    assert(kp.privateKeyBytes.length === 32, `Private key should be 32 bytes, got ${kp.privateKeyBytes.length}`);
    assert(kp.publicKeyBytes.length === 32, `Public key should be 32 bytes, got ${kp.publicKeyBytes.length}`);
    assert(kp.privateKey.length === 64, `Private key hex should be 64 chars, got ${kp.privateKey.length}`);
    assert(kp.publicKey.length === 64, `Public key hex should be 64 chars, got ${kp.publicKey.length}`);
  });

  test('Generated keys are non-zero', () => {
    const kp = generateEd25519Keypair();
    const allZero = (bytes: Uint8Array) => bytes.every((b) => b === 0);
    assert(!allZero(kp.privateKeyBytes), 'Private key is all zeros');
    assert(!allZero(kp.publicKeyBytes), 'Public key is all zeros');
  });

  test('Two keypairs are different', () => {
    const kp1 = generateEd25519Keypair();
    const kp2 = generateEd25519Keypair();
    assert(kp1.privateKey !== kp2.privateKey, 'Same private key generated twice');
    assert(kp1.publicKey !== kp2.publicKey, 'Same public key generated twice');
  });

  test('Import keypair from seed (round-trip)', () => {
    const original = generateEd25519Keypair();
    const imported = importEd25519Keypair(original.privateKeyBytes);
    assert(imported.privateKey === original.privateKey, 'Private key mismatch after import');
    assert(imported.publicKey === original.publicKey, 'Public key mismatch after import');
    assert(
      Buffer.compare(Buffer.from(imported.publicKeyBytes), Buffer.from(original.publicKeyBytes)) === 0,
      'Public key bytes mismatch after import',
    );
  });

  test('getEd25519PublicKey derives correct public key', () => {
    const kp = generateEd25519Keypair();
    const pubFromSeed = getEd25519PublicKey(kp.privateKeyBytes);
    assert(
      Buffer.compare(Buffer.from(pubFromSeed), Buffer.from(kp.publicKeyBytes)) === 0,
      'Public key derivation mismatch',
    );
  });

  test('Import rejects invalid seed length', () => {
    try {
      importEd25519Keypair(new Uint8Array(16));
      assert(false, 'Should reject 16-byte seed');
    } catch (e: any) {
      assert(e.message.includes('32 bytes'), `Unexpected error: ${e.message}`);
    }

    try {
      importEd25519Keypair(new Uint8Array(64));
      assert(false, 'Should reject 64-byte seed');
    } catch (e: any) {
      assert(e.message.includes('32 bytes'), `Unexpected error: ${e.message}`);
    }
  });

  test('generateEd25519Seed produces 32 random bytes', () => {
    const seed1 = generateEd25519Seed();
    const seed2 = generateEd25519Seed();
    assert(seed1.length === 32, `Seed should be 32 bytes, got ${seed1.length}`);
    assert(
      Buffer.compare(Buffer.from(seed1), Buffer.from(seed2)) !== 0,
      'Two seeds should be different',
    );
  });

  // ── Sign & Verify ────────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('Sign & Verify');
  console.log('\u2500'.repeat(62));

  test('Sign produces 64-byte signature', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('hello solana from velumx mpc'));
    const sig = signEd25519(message, kp);
    assert(sig.signature.length === 64, `Signature should be 64 bytes, got ${sig.signature.length}`);
    assert(sig.hex.length === 128, `Signature hex should be 128 chars, got ${sig.hex.length}`);
  });

  test('Sign + verify round-trip', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('sign and verify test message'));

    const sig = signEd25519(message, kp);
    const valid = verifyEd25519(message, sig, kp.publicKeyBytes);
    assert(valid, 'Valid signature did not verify');
  });

  test('Sign + verify with hex public key', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('verify with hex pubkey'));

    const sig = signEd25519(message, kp);
    const valid = verifyEd25519(message, sig, kp.publicKey);
    assert(valid, 'Valid signature did not verify against hex public key');
  });

  test('Sign with private key string', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('sign with privkey string'));

    const sig = signEd25519(message, { privateKey: kp.privateKey });
    const valid = verifyEd25519(message, sig, kp.publicKeyBytes);
    assert(valid, 'Signature from privateKey string did not verify');
  });

  test('Sign with privateKeyBytes', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('sign with privkey bytes'));

    const sig = signEd25519(message, { privateKeyBytes: kp.privateKeyBytes });
    const valid = verifyEd25519(message, sig, kp.publicKeyBytes);
    assert(valid, 'Signature from privateKeyBytes did not verify');
  });

  test('Wrong public key rejects signature', () => {
    const kp1 = generateEd25519Keypair();
    const kp2 = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('wrong key test'));

    const sig = signEd25519(message, kp1);
    const valid = verifyEd25519(message, sig, kp2.publicKeyBytes);
    assert(!valid, 'Wrong public key should reject signature');
  });

  test('Tampered message rejects signature', () => {
    const kp = generateEd25519Keypair();
    const original = new Uint8Array(Buffer.from('original message'));
    const tampered = new Uint8Array(Buffer.from('tampered message'));

    const sig = signEd25519(original, kp);
    const valid = verifyEd25519(tampered, sig, kp.publicKeyBytes);
    assert(!valid, 'Tampered message should reject signature');
  });

  test('Tampered signature rejects', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('tampered sig test'));

    const sig = signEd25519(message, kp);
    const tampered = new Uint8Array(sig.signature);
    tampered[0] = (tampered[0] + 1) % 256;

    const valid = verifyEd25519(message, tampered, kp.publicKeyBytes);
    assert(!valid, 'Tampered signature should reject');
  });

  test('Empty message sign + verify', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(0);

    const sig = signEd25519(message, kp);
    const valid = verifyEd25519(message, sig, kp.publicKeyBytes);
    assert(valid, 'Empty message signature did not verify');
  });

  test('Large message (1KB) sign + verify', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(1024);
    for (let i = 0; i < 1024; i++) message[i] = i % 256;

    const sig = signEd25519(message, kp);
    const valid = verifyEd25519(message, sig, kp.publicKeyBytes);
    assert(valid, 'Large message signature did not verify');
  });

  test('Deterministic signing: same message + key = same signature', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('deterministic ed25519 test'));

    const sig1 = signEd25519(message, kp);
    const sig2 = signEd25519(message, kp);

    assert(
      Buffer.compare(Buffer.from(sig1.signature), Buffer.from(sig2.signature)) === 0,
      'Ed25519 should produce deterministic signatures for same inputs',
    );
  });

  test('Different messages produce different signatures', () => {
    const kp = generateEd25519Keypair();
    const msg1 = new Uint8Array(Buffer.from('message one'));
    const msg2 = new Uint8Array(Buffer.from('message two'));

    const sig1 = signEd25519(msg1, kp);
    const sig2 = signEd25519(msg2, kp);

    assert(
      Buffer.compare(Buffer.from(sig1.signature), Buffer.from(sig2.signature)) !== 0,
      'Different messages should produce different signatures',
    );
  });

  // ── Signature Format ─────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('Signature Format');
  console.log('\u2500'.repeat(62));

  test('Signature hex is valid lowercase hex', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('hex format test'));
    const sig = signEd25519(message, kp);

    assert(/^[0-9a-f]{128}$/.test(sig.hex), `Invalid hex format: ${sig.hex.slice(0, 20)}...`);
  });

  // ── Solana Compatibility ────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('Solana Compatibility');
  console.log('\u2500'.repeat(62));

  test('Solana-style keypair generation', () => {
    // Solana uses Ed25519. A Solana keypair is just 64 bytes: [32-byte seed | 32-byte pubkey]
    const kp = generateEd25519Keypair();
    const solanaKeypair = Buffer.concat([
      Buffer.from(kp.privateKeyBytes),
      Buffer.from(kp.publicKeyBytes),
    ]);

    assert(solanaKeypair.length === 64, `Solana keypair should be 64 bytes, got ${solanaKeypair.length}`);

    // Verify the public key portion matches
    const pubPart = solanaKeypair.subarray(32, 64);
    assert(
      Buffer.compare(pubPart, Buffer.from(kp.publicKeyBytes)) === 0,
      'Solana keypair public key portion mismatch',
    );
  });

  test('Sign Solana-compatible transaction message', () => {
    const kp = generateEd25519Keypair();
    // Simulate a Solana transaction message (arbitrary bytes)
    const txMessage = new Uint8Array(Buffer.from('solana-tx-signature-test-12345'));

    const sig = signEd25519(txMessage, kp);
    const valid = verifyEd25519(txMessage, sig, kp.publicKeyBytes);
    assert(valid, 'Solana-style signature did not verify');
  });

  // ── Performance ──────────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(62));
  console.log('Performance');
  console.log('\u2500'.repeat(62));

  test('Key generation performance', () => {
    const runs = 100;
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      generateEd25519Keypair();
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / runs;
    console.log(`    avg: ${avg.toFixed(2)}ms per keygen (${runs} runs)`);
    assert(avg < 10, `Key generation too slow: ${avg.toFixed(2)}ms avg`);
  });

  test('Signing performance', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('performance test message with moderate length'));
    const runs = 500;
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      signEd25519(message, kp);
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / runs;
    const p95 = times.sort((a, b) => a - b)[Math.floor(runs * 0.95)];
    console.log(`    avg: ${avg.toFixed(3)}ms, p95: ${p95.toFixed(3)}ms (${runs} runs)`);
    assert(avg < 5, `Signing too slow: ${avg.toFixed(3)}ms avg`);
  });

  test('Verification performance', () => {
    const kp = generateEd25519Keypair();
    const message = new Uint8Array(Buffer.from('verification performance test'));
    const sig = signEd25519(message, kp);
    const runs = 500;
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      verifyEd25519(message, sig, kp.publicKeyBytes);
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / runs;
    const p95 = times.sort((a, b) => a - b)[Math.floor(runs * 0.95)];
    console.log(`    avg: ${avg.toFixed(3)}ms, p95: ${p95.toFixed(3)}ms (${runs} runs)`);
    assert(avg < 5, `Verification too slow: ${avg.toFixed(3)}ms avg`);
  });

  // ── Summary ──────────────────────────────────────────────────────────
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
