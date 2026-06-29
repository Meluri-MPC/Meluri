/**
 * KMS Tests — provider abstraction, envelope encryption, audit logging.
 *
 * Run: npx tsx test/kms/kms.spec.ts
 */

import { randomBytes } from 'crypto';
import {
  LocalKmsProvider,
} from '../../src/kms/local';
import {
  AwsKmsProvider,
} from '../../src/kms/aws';
import {
  GcpKmsProvider,
} from '../../src/kms/gcp';
import { createKmsProvider } from '../../src/kms';
import { AuditLogger } from '../../src/kms/audit';
import type { KmsProvider, KmsEncryptedBlob } from '../../src/kms/types';

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
  console.log('  KMS Provider Tests');
  console.log('\u2550'.repeat(70) + '\n');

  // ──────── Audit Logger ─────────────────────────────────────────────
  console.log('\u2500'.repeat(70));
  console.log('Audit Logger');
  console.log('\u2500'.repeat(70));

  test('Audit logger records events', () => {
    const audit = new AuditLogger(100);
    audit.log('encrypt', 'local', 'key-1', { success: true, context: 'wallet-1' });
    audit.log('decrypt', 'local', 'key-1', { success: true, context: 'wallet-1' });
    audit.log('access_denied', 'local', 'key-1', { success: false, error: 'unauthorized' });

    const entries = audit.getEntries();
    assert(entries.length === 3, `Expected 3 entries, got ${entries.length}`);
    assert(entries[0].action === 'encrypt', 'First entry should be encrypt');
    assert(entries[2].action === 'access_denied', 'Last entry should be access_denied');
  });

  test('Audit logger emits events', () => {
    return new Promise<void>((resolve) => {
      const audit = new AuditLogger(100);
      audit.on('audit', (entry) => {
        assert(entry.action === 'encrypt', 'Wrong action');
        assert(entry.keyId === 'emit-test', 'Wrong key');
        assert(entry.success === true, 'Should be success');
        resolve();
      });
      audit.log('encrypt', 'local', 'emit-test', { success: true });
    });
  });

  test('Audit logger can be disabled', () => {
    const audit = new AuditLogger();
    audit.disable();
    const entry = audit.log('encrypt', 'local', 'key', { success: true });
    assert(entry.id === 'disabled', 'Should return stub when disabled');
    assert(audit.getEntries().length === 0, 'No entries when disabled');
  });

  test('Audit logger evicts old entries', () => {
    const audit = new AuditLogger(5);
    for (let i = 0; i < 10; i++) {
      audit.log('encrypt', 'local', `key-${i}`, { success: true });
    }
    const entries = audit.getEntries();
    assert(entries.length === 5, `Should keep max 5, got ${entries.length}`);
    assert(entries[4].keyId === 'key-9', 'Last entry should be newest');
  });

  test('Audit logger countByAction', () => {
    const audit = new AuditLogger(100);
    audit.log('encrypt', 'local', 'k', { success: true });
    audit.log('encrypt', 'local', 'k', { success: true });
    audit.log('encrypt', 'local', 'k', { success: true });
    audit.log('decrypt', 'local', 'k', { success: true });
    audit.log('key_rotate', 'local', 'k', { success: true });

    const counts = audit.countByAction();
    assert(counts.encrypt === 3, `Expected 3 encrypts, got ${counts.encrypt}`);
    assert(counts.decrypt === 1, `Expected 1 decrypt, got ${counts.decrypt}`);
    assert(counts.key_rotate === 1, `Expected 1 rotate, got ${counts.key_rotate}`);
  });

  // ──────── Local KMS ────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Local KMS Provider');
  console.log('\u2500'.repeat(70));

  test('LocalKmsProvider encrypt → decrypt round-trip', async () => {
    const kms = new LocalKmsProvider();
    const plaintext = randomBytes(64);
    const encrypted = await kms.encrypt(plaintext, 'wallet:test:share:1');
    const decrypted = await kms.decrypt(encrypted, 'wallet:test:share:1');

    assert(Buffer.compare(plaintext, decrypted) === 0, 'Round-trip failed');
  });

  test('LocalKmsProvider decrypt with wrong context fails', async () => {
    const kms = new LocalKmsProvider();
    const plaintext = randomBytes(32);
    const encrypted = await kms.encrypt(plaintext, 'wallet:a:share:1');

    try {
      await kms.decrypt(encrypted, 'wallet:b:share:1'); // Different context
      assert(false, 'Should fail with wrong context');
    } catch (e: any) {
      assert(e.message.includes('decryption failed'), `Expected decryption error: ${e.message}`);
    }
  });

  test('LocalKmsProvider tampered ciphertext fails', async () => {
    const kms = new LocalKmsProvider();
    const plaintext = randomBytes(32);
    const encrypted = await kms.encrypt(plaintext, 'wallet:tamper:share:1');

    // Tamper
    const tampered = Buffer.from(encrypted.ciphertext, 'base64');
    tampered[0] = (tampered[0] + 1) % 256;
    const bad: KmsEncryptedBlob = { ...encrypted, ciphertext: tampered.toString('base64') };

    try {
      await kms.decrypt(bad, 'wallet:tamper:share:1');
      assert(false, 'Should detect tampering');
    } catch (e: any) {
      assert(e.message.includes('decryption failed'), `Expected decryption error: ${e.message}`);
    }
  });

  test('LocalKmsProvider getKeyMetadata', async () => {
    const kms = new LocalKmsProvider();
    const meta = await kms.getKeyMetadata();
    assert(meta.provider === 'local', 'Wrong provider');
    assert(meta.purpose === 'mpc-share-encryption', 'Wrong purpose');
    assert(meta.isActive === true, 'Should be active');
  });

  test('LocalKmsProvider healthCheck', async () => {
    const kms = new LocalKmsProvider();
    const healthy = await kms.healthCheck();
    assert(healthy, 'Should be healthy');
  });

  test('LocalKmsProvider rotateKey produces new key', async () => {
    const kms = new LocalKmsProvider();
    const oldHex = kms.exportKeyHex();
    await kms.rotateKey!();
    const newHex = kms.exportKeyHex();
    assert(oldHex !== newHex, 'Key should change after rotation');
  });

  test('LocalKmsProvider audit logging', async () => {
    const audit = new AuditLogger(100);
    const kms = new LocalKmsProvider({ audit });
    await kms.encrypt(randomBytes(32), 'wallet:audit:share:1');
    await kms.decrypt(await kms.encrypt(randomBytes(32), 'wallet:audit:share:1'), 'wallet:audit:share:1');

    const entries = audit.getEntries();
    assert(entries.length >= 2, `Expected at least 2 audit entries, got ${entries.length}`);
    assert(entries[0].action === 'encrypt', 'First should be encrypt');
    assert(entries[entries.length - 1].action === 'decrypt', 'Last should be decrypt');
  });

  test('LocalKmsProvider exportKeyHex is 64 chars', () => {
    const kms = new LocalKmsProvider();
    const hex = kms.exportKeyHex();
    assert(hex.length === 64, `Key hex should be 64 chars, got ${hex.length}`);
  });

  test('LocalKmsProvider imports key from hex', async () => {
    const keyHex = randomBytes(32).toString('hex');
    const kms = new LocalKmsProvider({ keyHex });
    const plaintext = randomBytes(32);
    const encrypted = await kms.encrypt(plaintext, 'wallet:import:share:1');
    const decrypted = await kms.decrypt(encrypted, 'wallet:import:share:1');
    assert(Buffer.compare(plaintext, decrypted) === 0, 'Imported key round-trip failed');
  });

  // ──────── AWS KMS ──────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('AWS KMS Provider');
  console.log('\u2500'.repeat(70));

  test('AwsKmsProvider encrypt → decrypt round-trip', async () => {
    const kms = new AwsKmsProvider({
      keyArn: 'arn:aws:kms:us-east-1:123456789:key/test-key',
      mock: true,
    });
    const plaintext = randomBytes(64);
    const encrypted = await kms.encrypt(plaintext, 'wallet:aws:share:1');
    assert(encrypted.provider === 'aws-kms', 'Wrong provider in envelope');
    assert(encrypted.kmsKeyId.includes('arn:aws:kms'), 'Wrong key ARN');
    assert(encrypted.encryptedDek !== undefined, 'Missing encrypted DEK');

    const decrypted = await kms.decrypt(encrypted, 'wallet:aws:share:1');
    assert(Buffer.compare(plaintext, decrypted) === 0, 'AWS round-trip failed');
  });

  test('AwsKmsProvider getKeyMetadata', async () => {
    const kms = new AwsKmsProvider({ keyArn: 'arn:aws:kms:us-east-1:key/test', mock: true });
    const meta = await kms.getKeyMetadata();
    assert(meta.provider === 'aws-kms', 'Wrong provider');
    assert(meta.keyId === 'arn:aws:kms:us-east-1:key/test', 'Wrong key ID');
  });

  test('AwsKmsProvider healthCheck', async () => {
    const kms = new AwsKmsProvider({ keyArn: 'arn:test', mock: true });
    assert(await kms.healthCheck(), 'Should be healthy');
  });

  // ──────── GCP KMS ──────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('GCP KMS Provider');
  console.log('\u2500'.repeat(70));

  test('GcpKmsProvider encrypt → decrypt round-trip', async () => {
    const kms = new GcpKmsProvider({
      projectId: 'test-project',
      keyRing: 'mpc-keys',
      keyName: 'share-key',
      mock: true,
    });
    const plaintext = randomBytes(64);
    const encrypted = await kms.encrypt(plaintext, 'wallet:gcp:share:1');
    assert(encrypted.provider === 'gcp-kms', 'Wrong provider in envelope');
    assert(encrypted.kmsKeyId.includes('projects/'), 'Wrong key resource name');
    assert(encrypted.encryptedDek !== undefined, 'Missing encrypted DEK');

    const decrypted = await kms.decrypt(encrypted, 'wallet:gcp:share:1');
    assert(Buffer.compare(plaintext, decrypted) === 0, 'GCP round-trip failed');
  });

  test('GcpKmsProvider keyId format', () => {
    const kms = new GcpKmsProvider({
      projectId: 'my-proj',
      keyRing: 'my-ring',
      keyName: 'my-key',
      location: 'us-central1',
      mock: true,
    });
    assert(
      kms.keyId === 'projects/my-proj/locations/us-central1/keyRings/my-ring/cryptoKeys/my-key',
      `Wrong key ID format: ${kms.keyId}`,
    );
  });

  test('GcpKmsProvider getKeyMetadata', async () => {
    const kms = new GcpKmsProvider({
      projectId: 'p', keyRing: 'r', keyName: 'k', mock: true,
    });
    const meta = await kms.getKeyMetadata();
    assert(meta.provider === 'gcp-kms', 'Wrong provider');
    assert(meta.keyRing === 'r', 'Wrong key ring');
  });

  // ──────── Provider Factory ──────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Provider Factory');
  console.log('\u2500'.repeat(70));

  test('createKmsProvider: local', async () => {
    const kms = createKmsProvider({ type: 'local' });
    assert(kms.type === 'local', 'Wrong type');
    const encrypted = await kms.encrypt(randomBytes(32), 'ctx');
    const decrypted = await kms.decrypt(encrypted, 'ctx');
    assert(Buffer.compare(decrypted, decrypted) === 0, 'Factory local works');
  });

  test('createKmsProvider: aws-kms', async () => {
    const kms = createKmsProvider({
      type: 'aws-kms',
      awsKeyArn: 'arn:aws:kms:us-east-1:123:key/abc',
    });
    assert(kms.type === 'aws-kms', 'Wrong type');

    const encrypted = await kms.encrypt(randomBytes(32), 'ctx');
    const decrypted = await kms.decrypt(encrypted, 'ctx');
    assert(Buffer.compare(decrypted, decrypted) === 0, 'Factory AWS works');
  });

  test('createKmsProvider: gcp-kms', async () => {
    const kms = createKmsProvider({
      type: 'gcp-kms',
      gcpProjectId: 'my-proj',
      gcpKeyRing: 'my-ring',
      gcpKeyName: 'my-key',
    });
    assert(kms.type === 'gcp-kms', 'Wrong type');

    const encrypted = await kms.encrypt(randomBytes(32), 'ctx');
    const decrypted = await kms.decrypt(encrypted, 'ctx');
    assert(Buffer.compare(decrypted, decrypted) === 0, 'Factory GCP works');
  });

  test('createKmsProvider throws on unknown type', () => {
    try {
      createKmsProvider({ type: 'unknown' as any });
      assert(false, 'Should throw');
    } catch (e: any) {
      assert(e.message.includes('Unknown KMS'), `Expected error: ${e.message}`);
    }
  });

  test('Factory local produces unique keys per instance', async () => {
    const k1 = createKmsProvider({ type: 'local' });
    const k2 = createKmsProvider({ type: 'local' });

    const pt = randomBytes(32);
    const e1 = await k1.encrypt(pt, 'ctx');
    const e2 = await k2.encrypt(pt, 'ctx');

    // Different keys = different ciphertexts
    assert(e1.ciphertext !== e2.ciphertext, 'Different keys should produce different ciphertexts');

    // Each should decrypt its own
    const d1 = await k1.decrypt(e1, 'ctx');
    const d2 = await k2.decrypt(e2, 'ctx');
    assert(Buffer.compare(pt, d1) === 0, 'k1 round-trip');
    assert(Buffer.compare(pt, d2) === 0, 'k2 round-trip');

    // Cross-decrypt should fail
    try {
      await k1.decrypt(e2, 'ctx');
      assert(false, 'Cross-decrypt should fail');
    } catch {
      // expected
    }
  });

  test('LocalKmsProvider gate: throws in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      try {
        new LocalKmsProvider();
        assert(false, 'Should throw in production');
      } catch (e: any) {
        assert(e.message.includes('production'), `Expected production gate: ${e.message}`);
      }
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  // ──────── Summary ───────────────────────────────────────────────────
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
  }, 1000);
}

runTests();
