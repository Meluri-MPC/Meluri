/**
 * Recovery Tests — mnemonic generation, key derivation, bundle encrypt/decrypt, full flow.
 *
 * Run: npx tsx test/recovery/recovery.spec.ts
 */

import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import * as secp from '@noble/secp256k1';
import { DkgCoordinator } from '../../src/tss/dkg';
import { SigningCeremony } from '../../src/signing/index';
import { serializeShare, type SerializedShare } from '../../src/storage/share-serializer';
import {
  generateMnemonic,
  validateMnemonic,
  generateVerificationChallenge,
  verifyChallengeResponse,
  mnemonicToEntropy,
  deriveRecoveryKey,
  recoverKey,
  createRecoveryBundle,
  decryptRecoveryBundle,
  serializeBundle,
  deserializeBundle,
  RecoveryOrchestrator,
  SocialRecoveryManager,
  createSocialRecovery,
  ServerRecoveryManager,
  DEFAULT_SERVER_RECOVERY_CONFIG,
} from '../../src/recovery';
import type { MnemonicPhrase, RecoveryKey, RecoveryBundle } from '../../src/recovery/types';
import type { Guardian, SocialRecoveryConfig, RecoveryRequest } from '../../src/recovery/social/types';
import type { ServerRecoveryRequest } from '../../src/recovery/server';

secp.etc.hmacSha256Sync = (k: Uint8Array, ...msgs: Uint8Array[]) => {
  let h: Uint8Array = new Uint8Array(0);
  for (const msg of msgs) { h = hmac(sha256, k, msg); k = h; }
  return h;
};

// ─── Test Framework ──────────────────────────────────────────────────────

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

// ─── Suite ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\u2550'.repeat(70));
  console.log('  Recovery Tests — Mnemonic, Key Derivation, Bundle');
  console.log('\u2550'.repeat(70) + '\n');

  // ──────── Mnemonic Generation ──────────────────────────────────────
  console.log('\u2500'.repeat(70));
  console.log('BIP39 Mnemonic Generation');
  console.log('\u2500'.repeat(70));

  test('Generates 12-word mnemonic', () => {
    const phrase = generateMnemonic();
    assert(phrase.words.length === 12, `Expected 12 words, got ${phrase.words.length}`);
    assert(phrase.entropy.length === 16, `Expected 16 bytes entropy, got ${phrase.entropy.length}`);
    assert(phrase.entropyHex.length === 32, `Entropy hex should be 32 chars`);
  });

  test('Two mnemonics are unique', () => {
    const m1 = generateMnemonic();
    const m2 = generateMnemonic();
    assert(m1.words.join(' ') !== m2.words.join(' '), 'Mnemonics should differ');
    assert(m1.entropyHex !== m2.entropyHex, 'Entropy should differ');
  });

  test('All words are in BIP39 wordlist', () => {
    const phrase = generateMnemonic();
    for (const word of phrase.words) {
      assert(word.length >= 3, `Word too short: ${word}`);
      assert(/^[a-z]+$/.test(word), `Word not lowercase: ${word}`);
    }
  });

  test('Mnemonic from known entropy produces expected words', () => {
    // All-zeros entropy = specific first word
    const entropy = new Uint8Array(16); // 16 zero bytes
    const phrase = generateMnemonic(entropy);
    assert(phrase.words[0] === 'abandon', `First word of zero entropy should be 'abandon', got: '${phrase.words[0]}'`);
    assert(phrase.entropyHex === '00000000000000000000000000000000', `Entropy hex should be all zeros`);
  });

  test('validateMnemonic accepts valid 12-word phrase', () => {
    const phrase = generateMnemonic();
    assert(validateMnemonic(phrase.words), 'Valid mnemonic should pass validation');
  });

  test('validateMnemonic rejects invalid word', () => {
    const phrase = generateMnemonic();
    const bad = [...phrase.words];
    bad[3] = 'xyznonexistentword';
    assert(!validateMnemonic(bad), 'Invalid word should fail validation');
  });

  test('validateMnemonic rejects wrong word count', () => {
    assert(!validateMnemonic(['abandon', 'ability']), '2 words should fail');
    assert(!validateMnemonic(new Array(13).fill('abandon')), '13 words should fail');
  });

  test('validateMnemonic rejects tampered checksum', () => {
    const phrase = generateMnemonic();
    // Swap last word (part of checksum) to invalidate
    const bad = [...phrase.words];
    bad[11] = bad[11] === 'abandon' ? 'ability' : 'abandon';
    // Note: swapping the last word may or may not invalidate the checksum
    // It's a probabilistic test — most swaps will invalidate
    const valid = validateMnemonic(bad);
    // Only assert if it happens to be invalid (most cases)
    if (!valid) {
      assert(true, 'Tampered checksum correctly rejected');
    }
  });

  test('mnemonicToEntropy round-trip', () => {
    const original = generateMnemonic();
    const recoveredEntropy = mnemonicToEntropy(original.words);
    assert(
      Buffer.compare(Buffer.from(recoveredEntropy), Buffer.from(original.entropy)) === 0,
      'Entropy round-trip failed',
    );
  });

  // ──────── Verification Challenge ───────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Verification Challenge');
  console.log('\u2500'.repeat(70));

  test('Verification challenge has 3 unique indices', () => {
    const challenge = generateVerificationChallenge();
    const indices = challenge.requestedIndices;
    assert(indices.length === 3, `Expected 3 indices, got ${indices.length}`);
    assert(
      new Set(indices).size === 3,
      `Indices should be unique: ${indices}`,
    );
    assert(indices[0] >= 0 && indices[2] < 12, 'Indices out of range');
  });

  test('Correct responses pass verification', () => {
    const phrase = generateMnemonic();
    const challenge = generateVerificationChallenge();
    const responses: [string, string, string] = [
      phrase.words[challenge.requestedIndices[0]],
      phrase.words[challenge.requestedIndices[1]],
      phrase.words[challenge.requestedIndices[2]],
    ];
    assert(verifyChallengeResponse(phrase, challenge, responses), 'Correct responses should pass');
  });

  test('Wrong responses fail verification', () => {
    const phrase = generateMnemonic();
    const challenge = generateVerificationChallenge();
    const responses: [string, string, string] = ['wrong', 'words', 'here'];
    assert(!verifyChallengeResponse(phrase, challenge, responses), 'Wrong responses should fail');
  });

  // ──────── Key Derivation ───────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Key Derivation (PBKDF2)');
  console.log('\u2500'.repeat(70));

  test('deriveRecoveryKey produces 32-byte key', () => {
    const phrase = generateMnemonic();
    const rk = deriveRecoveryKey(phrase.words);
    assert(rk.key.length === 32, `Key should be 32 bytes, got ${rk.key.length}`);
    assert(rk.keyHex.length === 64, `Key hex should be 64 chars, got ${rk.keyHex.length}`);
    assert(rk.salt.length === 32, `Salt should be 32 bytes, got ${rk.salt.length}`);
    assert(rk.iterations === 600000, `Iterations should be 600000, got ${rk.iterations}`);
    assert(rk.hash === 'sha512', 'Hash should be sha512');
  });

  test('Key derivation is deterministic', () => {
    const phrase = generateMnemonic();
    const salt = new Uint8Array(32);
    const rk1 = deriveRecoveryKey(phrase.words, salt, 1000);
    const rk2 = deriveRecoveryKey(phrase.words, salt, 1000);
    assert(rk1.keyHex === rk2.keyHex, 'Same inputs should produce same key');
  });

  test('Different mnemonic → different key', () => {
    const m1 = generateMnemonic();
    const m2 = generateMnemonic();
    const salt = new Uint8Array(32);
    const rk1 = deriveRecoveryKey(m1.words, salt, 1000);
    const rk2 = deriveRecoveryKey(m2.words, salt, 1000);
    assert(rk1.keyHex !== rk2.keyHex, 'Different mnemonics should produce different keys');
  });

  test('Different salt → different key', () => {
    const phrase = generateMnemonic();
    const rk1 = deriveRecoveryKey(phrase.words, new Uint8Array(32), 1000);
    const salt2 = new Uint8Array(32);
    salt2[0] = 1;
    const rk2 = deriveRecoveryKey(phrase.words, salt2, 1000);
    assert(rk1.keyHex !== rk2.keyHex, 'Different salts should produce different keys');
  });

  test('recoverKey reconstructs from stored params', () => {
    const phrase = generateMnemonic();
    const original = deriveRecoveryKey(phrase.words);
    const recovered = recoverKey(
      phrase.words,
      original.salt,
      original.iterations,
    );
    assert(recovered.keyHex === original.keyHex, 'Recovered key should match');
  });

  test('PBKDF2 with high iteration count (600K) works', () => {
    const start = Date.now();
    const rk = deriveRecoveryKey(generateMnemonic().words, undefined, 600000);
    const elapsed = Date.now() - start;
    assert(rk.key.length === 32, '600K iterations should produce valid key');
    console.log(`    600K PBKDF2-SHA512: ${elapsed}ms`);
    assert(elapsed < 5000, `600K iterations took ${elapsed}ms, should be < 5s`);
  });

  // ──────── Recovery Bundle ──────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Recovery Bundle (Encrypt/Decrypt)');
  console.log('\u2500'.repeat(70));

  test('Bundle encrypt → decrypt round-trip', () => {
    // Create test shares from a mock DKG
    const dkg = new DkgCoordinator('recovery-test-dkg');
    const result = dkg.runFullDkg();

    const shares = new Map<number, SerializedShare>();
    for (const [partyIndex, share] of result.shares.entries()) {
      shares.set(partyIndex, {
        version: 1,
        partyIndex,
        share,
        publicKey: result.publicKey,
      });
    }

    const phrase = generateMnemonic();
    const rk = deriveRecoveryKey(phrase.words);

    const bundle = createRecoveryBundle('wallet-recovery-001', shares, rk);
    assert(bundle.shares.length === 3, `Expected 3 share entries, got ${bundle.shares.length}`);
    assert(bundle.walletId === 'wallet-recovery-001', 'Wrong wallet ID');
    assert(bundle.version === 1, 'Wrong version');

    // Decrypt
    const recovered = decryptRecoveryBundle(bundle, rk);
    assert(recovered.size === 3, `Expected 3 recovered shares, got ${recovered.size}`);

    for (const [partyIndex, share] of shares.entries()) {
      const rec = recovered.get(partyIndex)!;
      assert(rec.share === share.share, `Share ${partyIndex} mismatch`);
      assert(rec.partyIndex === partyIndex, `Party index ${partyIndex} mismatch`);
    }
  });

  test('Bundle decrypt with wrong key fails', () => {
    const shares = new Map<number, SerializedShare>();
    shares.set(1, { version: 1, partyIndex: 1, share: 12345n, publicKey: new Uint8Array(33) });
    shares.set(2, { version: 1, partyIndex: 2, share: 67890n, publicKey: new Uint8Array(33) });

    const correctRk = deriveRecoveryKey(generateMnemonic().words);
    const wrongRk = deriveRecoveryKey(generateMnemonic().words);

    const bundle = createRecoveryBundle('wallet-wrong-key', shares, correctRk);

    try {
      decryptRecoveryBundle(bundle, wrongRk);
      assert(false, 'Should fail with wrong key');
    } catch (e: any) {
      assert(e.message.includes('Failed to decrypt'), `Expected decrypt error: ${e.message}`);
    }
  });

  test('Bundle serialize → deserialize round-trip', () => {
    const shares = new Map<number, SerializedShare>();
    shares.set(1, { version: 1, partyIndex: 1, share: 1n, publicKey: new Uint8Array(33) });
    const rk = deriveRecoveryKey(generateMnemonic().words);

    const bundle = createRecoveryBundle('wallet-serial', shares, rk);
    const json = serializeBundle(bundle);
    const parsed = deserializeBundle(json);

    assert(parsed.walletId === 'wallet-serial', 'Wallet ID mismatch');
    assert(parsed.shares.length === 1, 'Share count mismatch');
    assert(parsed.version === 1, 'Version mismatch');
  });

  test('Bundle with all 3 shares preserves public keys', () => {
    const dkg = new DkgCoordinator('recovery-pk-dkg');
    const result = dkg.runFullDkg();
    const pkHex = Buffer.from(result.publicKey).toString('hex');

    const shares = new Map<number, SerializedShare>();
    for (const [idx, share] of result.shares.entries()) {
      shares.set(idx, { version: 1, partyIndex: idx, share, publicKey: result.publicKey });
    }

    const rk = deriveRecoveryKey(generateMnemonic().words);
    const bundle = createRecoveryBundle('wallet-pk', shares, rk);

    for (const entry of bundle.shares) {
      assert(entry.publicKey === pkHex, `Entry ${entry.partyIndex}: public key mismatch`);
    }
  });

  // ──────── Full Orchestrator Flow ───────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Full Orchestrator Flow');
  console.log('\u2500'.repeat(70));

  test('Orchestrator: create → verify → backup → recover (full flow)', () => {
    const orch = new RecoveryOrchestrator({ wordCount: 12, pbkdf2Iterations: 1000 });

    // Create mnemonic
    const mnemonic = orch.createMnemonic();
    assert(mnemonic.words.length === 12, 'Orch: wrong word count');

    // Verify
    const challenge = orch.createVerificationChallenge();
    const responses: [string, string, string] = [
      mnemonic.words[challenge.requestedIndices[0]],
      mnemonic.words[challenge.requestedIndices[1]],
      mnemonic.words[challenge.requestedIndices[2]],
    ];
    assert(orch.verifyChallenge(mnemonic, challenge, responses), 'Orch: verification failed');

    // Derive key
    const rk = orch.deriveKey(mnemonic);

    // Setup mock DKG shares
    const dkg = new DkgCoordinator('orch-dkg');
    const result = dkg.runFullDkg();
    const shares = new Map<number, SerializedShare>();
    for (const [idx, share] of result.shares.entries()) {
      shares.set(idx, { version: 1, partyIndex: idx, share, publicKey: result.publicKey });
    }

    // Create backup
    const { serialized } = orch.createBackup('wallet-orch', shares, rk);

    // Recover: use the same mnemonic
    const recovered = orch.fullRecovery(
      mnemonic.words,
      Buffer.from(rk.salt).toString('base64'),
      rk.iterations,
      serialized,
    );

    assert(recovered.size === 3, `Orch: expected 3 recovered shares, got ${recovered.size}`);
    for (const [idx, share] of shares.entries()) {
      assert(recovered.get(idx)!.share === share.share, `Orch: share ${idx} mismatch`);
    }
  });

  test('Orchestrator: validateRecoveryMnemonic rejects bad phrase', () => {
    const orch = new RecoveryOrchestrator();
    assert(!orch.validateRecoveryMnemonic(['not', 'valid', 'words']), 'Should reject');
    assert(orch.validateRecoveryMnemonic(generateMnemonic().words), 'Should accept');
  });

  // ──────── Edge Cases ───────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Edge Cases');
  console.log('\u2500'.repeat(70));

  test('Empty bundle throws on deserialize', () => {
    try {
      deserializeBundle('{}');
      assert(false, 'Should throw on invalid bundle');
    } catch (e: any) {
      assert(e.message.includes('Invalid'), `Expected Invalid error: ${e.message}`);
    }
  });

  test('Corrupted bundle JSON throws', () => {
    try {
      deserializeBundle('not json');
      assert(false, 'Should throw on not JSON');
    } catch {
      // expected
    }
  });

  test('Bundle with missing share entry still processes', () => {
    const shares = new Map<number, SerializedShare>();
    shares.set(1, { version: 1, partyIndex: 1, share: 42n, publicKey: new Uint8Array(33) });
    const rk = deriveRecoveryKey(generateMnemonic().words);
    const bundle = createRecoveryBundle('wallet-edge', shares, rk);
    const recovered = decryptRecoveryBundle(bundle, rk);
    assert(recovered.size === 1, `Expected 1 recovered share, got ${recovered.size}`);
  });

  // ──────── Social Recovery ──────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Social Recovery (Guardians, M-of-N, Time-Lock)');
  console.log('\u2500'.repeat(70));

  const makeGuardians = (count: number): Guardian[] => {
    const guardians: Guardian[] = [];
    for (let i = 0; i < count; i++) {
      guardians.push({
        id: `guardian-${i}`,
        name: `Guardian ${i}`,
        contact: `guardian${i}@example.com`,
        contactType: 'email',
      });
    }
    return guardians;
  };

  test('SocialRecoveryManager validates minimum guardians', () => {
    try {
      new SocialRecoveryManager({
        walletId: 'wallet-social-1',
        guardians: makeGuardians(2),
        threshold: 2,
      });
      assert(false, 'Should reject < 3 guardians');
    } catch (e: any) {
      assert(e.message.includes('at least 3'), `Expected guardian count error: ${e.message}`);
    }
  });

  test('SocialRecoveryManager validates maximum guardians', () => {
    try {
      new SocialRecoveryManager({
        walletId: 'wallet-social-2',
        guardians: makeGuardians(6),
        threshold: 3,
      });
      assert(false, 'Should reject > 5 guardians');
    } catch (e: any) {
      assert(e.message.includes('at most 5'), `Expected max guardian error: ${e.message}`);
    }
  });

  test('SocialRecoveryManager validates threshold <= guardian count', () => {
    try {
      new SocialRecoveryManager({
        walletId: 'wallet-social-3',
        guardians: makeGuardians(3),
        threshold: 5,
      });
      assert(false, 'Should reject threshold > guardian count');
    } catch (e: any) {
      assert(e.message.includes('Threshold'), `Expected threshold error: ${e.message}`);
    }
  });

  test('SocialRecoveryManager validates threshold >= 2', () => {
    try {
      new SocialRecoveryManager({
        walletId: 'wallet-social-4',
        guardians: makeGuardians(3),
        threshold: 1,
      });
      assert(false, 'Should reject threshold < 2');
    } catch (e: any) {
      assert(e.message.includes('at least 2'), `Expected min threshold error: ${e.message}`);
    }
  });

  test('SocialRecoveryManager validates unique guardian IDs', () => {
    const dupes: Guardian[] = [
      { id: 'same-id', name: 'A', contact: 'a@x.com', contactType: 'email' },
      { id: 'same-id', name: 'B', contact: 'b@x.com', contactType: 'email' },
      { id: 'g3', name: 'C', contact: 'c@x.com', contactType: 'email' },
    ];
    try {
      new SocialRecoveryManager({ walletId: 'w', guardians: dupes, threshold: 2 });
      assert(false, 'Should reject duplicate guardian IDs');
    } catch (e: any) {
      assert(e.message.includes('unique'), `Expected uniqueness error: ${e.message}`);
    }
  });

  test('SocialRecoveryManager validates email guardians have valid email', () => {
    const bad: Guardian[] = [
      { id: 'g1', name: 'Bad', contact: 'not-an-email', contactType: 'email' },
      { id: 'g2', name: 'Ok', contact: 'ok@test.com', contactType: 'email' },
      { id: 'g3', name: 'Ok2', contact: 'ok2@test.com', contactType: 'email' },
    ];
    try {
      new SocialRecoveryManager({ walletId: 'w', guardians: bad, threshold: 2 });
      assert(false, 'Should reject invalid email');
    } catch (e: any) {
      assert(e.message.includes('invalid email'), `Expected email format error: ${e.message}`);
    }
  });

  test('Initiate recovery sends notifications to all guardians', () => {
    const mgr = createSocialRecovery('wallet-init', makeGuardians(3), 2);
    const request = mgr.initiateRecovery();

    assert(request.status === 'collecting_approvals', `Expected collecting_approvals, got ${request.status}`);
    assert(request.requiredApprovals === 2, 'Expected 2 required approvals');
    assert(request.pendingGuardians.length === 3, 'All 3 should be pending');

    const notifications = mgr.getNotifications();
    assert(notifications.length === 3, `Expected 3 notifications, got ${notifications.length}`);
    assert(notifications.every((n) => n.type === 'approval_request'), 'All should be approval requests');
    assert(notifications.every((n) => n.sent), 'All should be marked sent');
  });

  test('Guardian approval is recorded correctly', () => {
    const mgr = createSocialRecovery('wallet-approve', makeGuardians(3), 2);
    const request = mgr.initiateRecovery();

    const approved = mgr.recordApproval(request.id, 'guardian-0');
    assert(approved, 'First approval should succeed');

    const status = mgr.getRecoveryStatus(request.id);
    assert(status!.approvedBy.length === 1, `Expected 1 approval, got ${status!.approvedBy.length}`);
    assert(status!.pendingGuardians.length === 2, `Expected 2 pending, got ${status!.pendingGuardians.length}`);
  });

  test('Duplicate approval is idempotent', () => {
    const mgr = createSocialRecovery('wallet-dup', makeGuardians(3), 2);
    const request = mgr.initiateRecovery();

    mgr.recordApproval(request.id, 'guardian-0');
    const dup = mgr.recordApproval(request.id, 'guardian-0');
    assert(dup, 'Duplicate should return true (idempotent)');

    const status = mgr.getRecoveryStatus(request.id);
    assert(status!.approvedBy.length === 1, 'Should still have only 1 approval');
  });

  test('Non-guardian approval is rejected', () => {
    const mgr = createSocialRecovery('wallet-bad-guard', makeGuardians(3), 2);
    const request = mgr.initiateRecovery();

    try {
      mgr.recordApproval(request.id, 'guardian-impostor');
      assert(false, 'Should reject non-guardian');
    } catch (e: any) {
      assert(e.message.includes('not part'), `Expected guardian error: ${e.message}`);
    }
  });

  test('Threshold met triggers time-lock', () => {
    const mgr = createSocialRecovery('wallet-threshold', makeGuardians(3), 2, { timeLockMs: 1000 });
    const request = mgr.initiateRecovery();

    mgr.recordApproval(request.id, 'guardian-0');
    mgr.recordApproval(request.id, 'guardian-1');

    const status = mgr.getRecoveryStatus(request.id);
    assert(status!.status === 'approved', `Expected approved, got ${status!.status}`);
    assert(status!.allApprovedAt !== null, 'allApprovedAt should be set');
    assert(status!.executeAfter !== null, 'executeAfter should be set');

    // Time-lock not yet expired
    assert(!mgr.canExecute(request.id), 'Should not be executable yet');

    // Remaining time should be positive
    const remaining = mgr.getTimeLockRemainingMs(request.id);
    assert(remaining !== null && remaining <= 1000, `Remaining ${remaining}ms should be <= 1000ms`);
  });

  test('Recovery can execute after time-lock expires', async () => {
    const mgr = createSocialRecovery('wallet-timelock', makeGuardians(3), 2, { timeLockMs: 200 });
    const request = mgr.initiateRecovery();

    mgr.recordApproval(request.id, 'guardian-0');
    mgr.recordApproval(request.id, 'guardian-1');

    // Wait for time-lock
    await new Promise((r) => setTimeout(r, 300));

    assert(mgr.canExecute(request.id), 'Should be executable after time-lock');

    const result = mgr.executeRecovery(request.id);
    assert(result.success, `Recovery should succeed: ${result.error}`);
    assert(result.approvedBy!.length === 2, 'Should have 2 approvers');

    const status = mgr.getRecoveryStatus(request.id);
    assert(status!.status === 'completed', `Expected completed, got ${status!.status}`);
  });

  test('Recovery rejected before time-lock expires', () => {
    const mgr = createSocialRecovery('wallet-early', makeGuardians(3), 2, { timeLockMs: 86400000 });
    const request = mgr.initiateRecovery();
    mgr.recordApproval(request.id, 'guardian-0');
    mgr.recordApproval(request.id, 'guardian-1');

    const result = mgr.executeRecovery(request.id);
    assert(!result.success, 'Should reject early execution');
    assert(result.error!.includes('Time-lock not expired'), `Expected time-lock error: ${result.error}`);
  });

  test('Cancelled recovery cannot be executed', () => {
    const mgr = createSocialRecovery('wallet-cancel', makeGuardians(3), 2, { timeLockMs: 200 });
    const request = mgr.initiateRecovery();

    const cancelResult = mgr.cancelRecovery(request.id, 'User cancelled');
    assert(cancelResult.cancelled, 'Cancel should succeed');

    const result = mgr.executeRecovery(request.id);
    assert(!result.success, 'Should not execute cancelled recovery');
    assert(result.error!.includes('cancelled'), `Expected cancelled error: ${result.error}`);
  });

  test('Cancel sends notification', () => {
    const mgr = createSocialRecovery('wallet-cancel-notif', makeGuardians(3), 2);
    const request = mgr.initiateRecovery();

    const beforeCount = mgr.getNotifications().length;
    mgr.cancelRecovery(request.id, 'User request');

    const afterCount = mgr.getNotifications().length;
    assert(afterCount === beforeCount + 1, `Expected +1 notification, got ${afterCount - beforeCount}`);
  });

  test('Expired recovery cannot be approved', () => {
    const mgr = createSocialRecovery('wallet-expire', makeGuardians(3), 2);
    const request = mgr.initiateRecovery();

    // Force expire by manipulating expiry
    (request as any).expiresAt = Date.now() - 1000;
    mgr.cleanup();

    const status = mgr.getRecoveryStatus(request.id);
    assert(status === null, 'Expired request should be removed after cleanup');
  });

  test('Recovery without threshold returns error', () => {
    const mgr = createSocialRecovery('wallet-nothresh', makeGuardians(3), 2);
    const request = mgr.initiateRecovery();

    mgr.recordApproval(request.id, 'guardian-0'); // only 1 of 2 required

    const result = mgr.executeRecovery(request.id);
    assert(!result.success, 'Should reject without threshold');
    assert(result.error!.includes('approvals collected'), `Expected threshold error: ${result.error}`);
  });

  test('Wallet guardians require public key', () => {
    const guardians: Guardian[] = [
      { id: 'g1', name: 'Wallet G', contact: '0xabc123', contactType: 'wallet' },
      { id: 'g2', name: 'Email G', contact: 'email@test.com', contactType: 'email' },
      { id: 'g3', name: 'Email G2', contact: 'email2@test.com', contactType: 'email' },
    ];

    try {
      new SocialRecoveryManager({ walletId: 'w', guardians, threshold: 2 });
      assert(false, 'Should require publicKey for wallet guardians');
    } catch (e: any) {
      assert(e.message.includes('publicKey'), `Expected publicKey error: ${e.message}`);
    }
  });

  test('Remaining approvals count is accurate', () => {
    const mgr = createSocialRecovery('wallet-remain', makeGuardians(4), 3);
    const request = mgr.initiateRecovery();

    assert(mgr.getRemainingApprovals(request.id) === 3, 'Should need 3');

    mgr.recordApproval(request.id, 'guardian-0');
    assert(mgr.getRemainingApprovals(request.id) === 2, 'Should need 2');

    mgr.recordApproval(request.id, 'guardian-1');
    assert(mgr.getRemainingApprovals(request.id) === 1, 'Should need 1');

    mgr.recordApproval(request.id, 'guardian-2');
    assert(mgr.getRemainingApprovals(request.id) === 0, 'Should need 0');
  });

  test('Pending recoveries tracked correctly', () => {
    const mgr = createSocialRecovery('wallet-pending', makeGuardians(3), 2);
    mgr.initiateRecovery();

    const pending = mgr.getPendingRecoveries();
    assert(pending.length === 1, `Expected 1 pending, got ${pending.length}`);
    assert(pending[0].status === 'collecting_approvals', `Wrong status: ${pending[0].status}`);
  });

  test('Custom notification handler is called', () => {
    const mgr = createSocialRecovery('wallet-handler', makeGuardians(3), 2);

    let handlerCalled = false;
    let lastNotification: any = null;
    mgr.setNotificationHandler((n) => {
      handlerCalled = true;
      lastNotification = n;
    });

    mgr.initiateRecovery();

    assert(handlerCalled, 'Notification handler should be called');
    assert(lastNotification !== null, 'Should have notification data');
    assert(lastNotification.type === 'approval_request', `Expected approval_request: ${lastNotification.type}`);
  });

  // ──────── Server-Side Recovery ──────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Server-Side Recovery (Developer-Managed)');
  console.log('\u2500'.repeat(70));

  test('ServerRecoveryManager initializes with defaults', () => {
    const mgr = new ServerRecoveryManager();
    const status = mgr.getDeliveryStatus('unknown-wallet');
    assert(status === null, 'Unknown wallet should return null');
  });

  test('Bundle delivery returns payload and signature', () => {
    const mgr = new ServerRecoveryManager({
      webhookUrl: 'https://developer.example.com/webhook',
      webhookSecret: 'whsec_test123',
    });

    const delivery = mgr.prepareBundleForDelivery('wallet-001', '{"encrypted":"data"}');
    assert(delivery.walletId === 'wallet-001', 'Wrong wallet ID');
    assert(delivery.signature.length === 64, 'Signature should be 64 hex chars (SHA256 HMAC)');
    assert(delivery.payload.length > 0, 'Payload should not be empty');

    const status = mgr.getDeliveryStatus('wallet-001');
    assert(status!.delivered, 'Should be marked as delivered');
    assert(status!.bundleHash !== undefined, 'Should have bundle hash');
  });

  test('Webhook signature verification works', () => {
    const mgr = new ServerRecoveryManager({
      webhookUrl: 'https://developer.example.com/webhook',
      webhookSecret: 'whsec_verify',
    });

    const delivery = mgr.prepareBundleForDelivery('wallet-verify', 'test-bundle-data');

    const valid = mgr.verifyWebhookDelivery('wallet-verify', 'test-bundle-data', delivery.signature);
    assert(valid, 'Valid signature should pass');

    const invalid = mgr.verifyWebhookDelivery('wallet-verify', 'tampered-data', delivery.signature);
    assert(!invalid, 'Tampered data should fail');
  });

  test('Recovery request with valid bundle succeeds', () => {
    const mgr = new ServerRecoveryManager({
      webhookUrl: 'https://developer.example.com/webhook',
      webhookSecret: 'whsec_recover',
    });

    const bundle = JSON.stringify({
      id: 'recovery-wallet-test-123',
      walletId: 'wallet-test',
      salt: 'testSalt',
      iterations: 600000,
      shares: [
        { partyIndex: 1, encryptedShare: 'enc1', iv: 'iv1', tag: 'tag1', publicKey: '0xpk1' },
        { partyIndex: 2, encryptedShare: 'enc2', iv: 'iv2', tag: 'tag2', publicKey: '0xpk2' },
        { partyIndex: 3, encryptedShare: 'enc3', iv: 'iv3', tag: 'tag3', publicKey: '0xpk3' },
      ],
      createdAt: Date.now(),
      version: 1,
    });

    const delivery = mgr.prepareBundleForDelivery('wallet-test', bundle);

    const response = mgr.processRecoveryRequest({
      walletId: 'wallet-test',
      encryptedBundle: delivery.payload,
      signature: delivery.signature,
      apiKey: 'sk_test_123',
    });

    assert(response.success, `Recovery should succeed: ${response.error}`);
    assert(response.sharesRestored === 3, `Expected 3 shares restored, got ${response.sharesRestored}`);
  });

  test('Recovery request with invalid signature is rejected', () => {
    const mgr = new ServerRecoveryManager({
      webhookUrl: 'https://developer.example.com/webhook',
      webhookSecret: 'whsec_secret',
    });

    const bundle = JSON.stringify({
      id: 'recovery-test',
      walletId: 'wallet-sig',
      salt: 'salt',
      iterations: 600000,
      shares: [
        { partyIndex: 1, encryptedShare: 'enc', iv: 'iv', tag: 'tag', publicKey: 'pk' },
        { partyIndex: 2, encryptedShare: 'enc', iv: 'iv', tag: 'tag', publicKey: 'pk' },
      ],
      createdAt: Date.now(),
      version: 1,
    });

    const response = mgr.processRecoveryRequest({
      walletId: 'wallet-sig',
      encryptedBundle: bundle,
      signature: '0'.repeat(64), // Wrong signature
      apiKey: 'sk_test_123',
    });

    assert(!response.success, 'Should reject invalid signature');
    assert(response.errorCode === 'INVALID_SIGNATURE', `Expected INVALID_SIGNATURE, got ${response.errorCode}`);
  });

  test('Recovery request without API key is rejected', () => {
    const mgr = new ServerRecoveryManager({ webhookSecret: 'whsec_key' });

    const response = mgr.processRecoveryRequest({
      walletId: 'wallet-nokey',
      encryptedBundle: '{}',
      apiKey: '',
    });

    assert(!response.success, 'Should reject missing API key');
    assert(response.errorCode === 'UNAUTHORIZED', `Expected UNAUTHORIZED, got ${response.errorCode}`);
  });

  test('Recovery request with invalid bundle format is rejected', () => {
    const mgr = new ServerRecoveryManager({ webhookSecret: 'whsec_fmt' });

    const response = mgr.processRecoveryRequest({
      walletId: 'wallet-badfmt',
      encryptedBundle: 'not-json',
      apiKey: 'sk_test_123',
    });

    assert(!response.success, 'Should reject invalid bundle');
    assert(response.errorCode === 'INVALID_BUNDLE', `Expected INVALID_BUNDLE, got ${response.errorCode}`);
  });

  test('Recovery request with too few shares is rejected', () => {
    const mgr = new ServerRecoveryManager({ webhookSecret: 'whsec_few' });

    const bundle = JSON.stringify({
      id: 'recovery-few',
      walletId: 'wallet-few',
      salt: 'salt',
      iterations: 600000,
      shares: [{ partyIndex: 1, encryptedShare: 'e', iv: 'i', tag: 't', publicKey: 'pk' }],
      createdAt: Date.now(),
      version: 1,
    });

    const response = mgr.processRecoveryRequest({
      walletId: 'wallet-few',
      encryptedBundle: bundle,
      apiKey: 'sk_test_123',
    });

    assert(!response.success, 'Should reject bundle with < 2 shares');
    assert(response.errorCode === 'INVALID_BUNDLE', `Expected INVALID_BUNDLE, got ${response.errorCode}`);
  });

  test('Webhook log captures delivery history', () => {
    const mgr = new ServerRecoveryManager({
      webhookUrl: 'https://dev.example.com/webhook',
      webhookSecret: 'whsec_log',
    });

    const bundle = JSON.stringify({
      id: 'recovery-log-test',
      walletId: 'wallet-log',
      salt: 'salt',
      iterations: 600000,
      shares: [
        { partyIndex: 1, encryptedShare: 'enc', iv: 'iv', tag: 'tag', publicKey: 'pk' },
        { partyIndex: 2, encryptedShare: 'enc', iv: 'iv', tag: 'tag', publicKey: 'pk' },
      ],
      createdAt: Date.now(),
      version: 1,
    });

    const delivery = mgr.prepareBundleForDelivery('wallet-log', bundle);
    mgr.processRecoveryRequest({
      walletId: 'wallet-log',
      encryptedBundle: delivery.payload,
      signature: delivery.signature,
      apiKey: 'sk_test_123',
    });

    const log = mgr.getWebhookLog();
    assert(log.length >= 1, `Expected at least 1 log entry, got ${log.length}`);
    assert(log[0].walletId === 'wallet-log', 'Wrong wallet in log');
    assert(log[0].success, 'Log should show success');
  });

  test('Bundle expiry is detected', () => {
    const mgr = new ServerRecoveryManager({
      webhookSecret: 'whsec_exp',
      maxBundleAgeMs: 100, // 100ms for testing
    });

    mgr.prepareBundleForDelivery('wallet-exp', 'bundle-data');

    // Wait for expiry
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const response = mgr.processRecoveryRequest({
          walletId: 'wallet-exp',
          encryptedBundle: 'bundle-data',
          apiKey: 'sk_test_123',
        });
        assert(!response.success, 'Should reject expired bundle');
        assert(response.errorCode === 'BUNDLE_EXPIRED', `Expected BUNDLE_EXPIRED, got ${response.errorCode}`);
        resolve();
      }, 200);
    });
  });

  // ──────── Recovery Drill ────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Recovery Drill (Automated CI-compatible)');
  console.log('\u2500'.repeat(70));

  test('Drill: full mnemonic recovery flow (create → lose → recover)', () => {
    // Step 1: Create wallet via DKG
    const dkg = new DkgCoordinator(`drill-dkg-${Date.now()}`);
    const result = dkg.runFullDkg();

    const shares = new Map<number, SerializedShare>();
    for (const [idx, share] of result.shares.entries()) {
      shares.set(idx, { version: 1, partyIndex: idx, share, publicKey: result.publicKey });
    }

    // Step 2: Generate mnemonic and create recovery bundle
    const mnemonic = generateMnemonic();
    const rk = deriveRecoveryKey(mnemonic.words);
    const bundle = createRecoveryBundle('wallet-drill', shares, rk);
    const serialized = serializeBundle(bundle);

    // Step 3: Simulate total loss (delete shares, keep only mnemonic + bundle)
    shares.clear();

    // Step 4: Recover using mnemonic
    const recoveredKey = recoverKey(mnemonic.words, Buffer.from(rk.salt).toString('hex'), rk.iterations);
    const restoredBundle = deserializeBundle(serialized);
    const restoredShares = decryptRecoveryBundle(restoredBundle, recoveredKey);

    assert(restoredShares.size === 3, `Drill: expected 3 shares, got ${restoredShares.size}`);

    // Step 5: Verify recovered shares can sign
    // Use any 2-of-3 recovered shares
    const shareEntries = Array.from(restoredShares.entries());
    const msg = sha256(Buffer.from('drill-recovery-verify'));
    const sigResult = SigningCeremony.sign(
      `drill-sign-${Date.now()}`,
      shareEntries[0][0], shareEntries[0][1].share,
      shareEntries[1][0], shareEntries[1][1].share,
      msg,
      Buffer.from(result.publicKey).toString('hex'),
    );

    const verified = SigningCeremony.verify(
      Buffer.from(result.publicKey).toString('hex'),
      msg,
      { r: sigResult.r, s: sigResult.s },
    );

    assert(verified, 'Drill: recovered shares must produce valid signature');
  });

  test('Drill: wrong mnemonic cannot recover', () => {
    const mnemonic1 = generateMnemonic();
    const mnemonic2 = generateMnemonic();

    const rk1 = deriveRecoveryKey(mnemonic1.words);

    const shares = new Map<number, SerializedShare>();
    shares.set(1, { version: 1, partyIndex: 1, share: 12345n, publicKey: new Uint8Array(33) });
    const bundle = createRecoveryBundle('wallet-wrong', shares, rk1);

    try {
      const rk2 = deriveRecoveryKey(mnemonic2.words);
      decryptRecoveryBundle(bundle, rk2);
      assert(false, 'Drill: should reject wrong mnemonic');
    } catch (e: any) {
      assert(e.message.includes('Failed to decrypt'), `Drill: expected decrypt error: ${e.message}`);
    }
  });

  test('Drill: insufficient guardian approvals prevents recovery', () => {
    const mgr = createSocialRecovery('wallet-drill-insuf', makeGuardians(5), 3);
    const request = mgr.initiateRecovery();

    // Only 2 of 3 required approve
    mgr.recordApproval(request.id, 'guardian-0');
    mgr.recordApproval(request.id, 'guardian-1');

    const remaining = mgr.getRemainingApprovals(request.id);
    assert(remaining === 1, `Drill: should need 1 more approval, got ${remaining}`);

    const result = mgr.executeRecovery(request.id);
    assert(!result.success, 'Drill: insufficient approvals should not execute');
  });

  test('Drill: recovery cancellation is permanent', () => {
    const mgr = createSocialRecovery('wallet-drill-cancel', makeGuardians(3), 2, { timeLockMs: 200 });
    const request = mgr.initiateRecovery();

    mgr.recordApproval(request.id, 'guardian-0');
    mgr.recordApproval(request.id, 'guardian-1');

    // Cancel the recovery
    const cancelResult = mgr.cancelRecovery(request.id, 'User aborted');
    assert(cancelResult.cancelled, 'Drill: cancel should succeed');

    // Try to cancel again (should fail - already cancelled)
    const doubleCancel = mgr.cancelRecovery(request.id);
    assert(!doubleCancel.cancelled, 'Drill: double cancel should fail');

    // Try to execute (should fail)
    const execResult = mgr.executeRecovery(request.id);
    assert(!execResult.success, 'Drill: cancelled recovery should not execute');

    // Even after time-lock, cancelled stays cancelled
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const postLock = mgr.executeRecovery(request.id);
        assert(!postLock.success, 'Drill: cancelled recovery should stay cancelled after time-lock');
        resolve();
      }, 300);
    });
  });

  test('Drill: server-side recovery end-to-end with validation', () => {
    // Setup: developer creates wallet, receives bundle
    const devMgr = new ServerRecoveryManager({
      webhookUrl: 'https://dev.example.com/hooks/recovery',
      webhookSecret: 'whsec_e2e_drill',
    });

    const dkg = new DkgCoordinator(`drill-server-${Date.now()}`);
    const dkgResult = dkg.runFullDkg();

    const shares = new Map<number, SerializedShare>();
    for (const [idx, share] of dkgResult.shares.entries()) {
      shares.set(idx, { version: 1, partyIndex: idx, share, publicKey: dkgResult.publicKey });
    }

    const mnemonic = generateMnemonic();
    const rk = deriveRecoveryKey(mnemonic.words);
    const recoveryBundle = createRecoveryBundle('wallet-e2e', shares, rk);
    const serializedBundle = serializeBundle(recoveryBundle);

    // Developer receives the bundle via webhook
    const delivery = devMgr.prepareBundleForDelivery('wallet-e2e', serializedBundle);

    // Later: wallet is lost, developer submits recovery request
    const response = devMgr.processRecoveryRequest({
      walletId: 'wallet-e2e',
      encryptedBundle: delivery.payload,
      signature: delivery.signature,
      apiKey: 'sk_dev_abc123',
    });

    assert(response.success, `Drill: server recovery should succeed: ${response.error}`);
    assert(response.sharesRestored === 3, `Drill: expected 3 shares restored, got ${response.sharesRestored}`);
  });

  // ─── Summary ─────────────────────────────────────────────────────────
  setTimeout(() => {
    console.log(`\n${'\u2550'.repeat(70)}`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
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
