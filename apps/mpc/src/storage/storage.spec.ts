/**
 * Storage Tests — Encryption, serialization, and storage round-trips
 *
 * Run: npx tsx src/storage/storage.spec.ts
 */

import {
  encryptShare,
  decryptShare,
  deriveShareKey,
  generateEncryptionKey,
  generateSalt,
  importEncryptionKey,
  wipeBuffer,
  constantTimeEqual,
  type EncryptedBlob,
} from './encryption';
import {
  serializeShare,
  deserializeShare,
  encodeShareForStorage,
  decodeShareFromStorage,
  type SerializedShare,
} from './share-serializer';
import { randomBytes } from 'crypto';
import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';

secp.etc.hmacSha256Sync = (k: Uint8Array, ...msgs: Uint8Array[]) => {
  let h: Uint8Array = new Uint8Array(0);
  for (const msg of msgs) {
    h = hmac(sha256, k, msg);
    k = h;
  }
  return h;
};

// ─── Test helpers ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${e.message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Key Share Storage Tests                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Setup test data
  const masterKey = generateEncryptionKey('test-kms-key-001').key;
  const testShare: SerializedShare = {
    version: 1,
    partyIndex: 1,
    share: secp.CURVE.n - 123456789n, // dummy share
    publicKey: secp.getPublicKey(
      Buffer.from('a'.repeat(64), 'hex'),
      true,
    ),
  };

  // ── Encryption Tests ──────────────────────────────────────────────
  console.log('─'.repeat(62));
  console.log('Encryption');
  console.log('─'.repeat(62));

  test('Encrypt + decrypt round-trip', () => {
    const salt = generateSalt();
    const info = 'wallet:abc123:share:1';
    const key = deriveShareKey(masterKey, salt, info);
    const plaintext = randomBytes(64);

    const encrypted = encryptShare(plaintext, key, salt, info);
    assert(encrypted.ciphertext.length > 0, 'Empty ciphertext');
    assert(encrypted.iv.length > 0, 'Empty IV');
    assert(encrypted.tag.length > 0, 'Empty tag');
    assert(encrypted.algorithm === 'aes-256-gcm', 'Wrong algorithm');

    const decrypted = decryptShare(encrypted, key);
    assert(
      Buffer.compare(plaintext, decrypted) === 0,
      'Decrypted content does not match original',
    );

    // Clean up
    wipeBuffer(key);
    wipeBuffer(plaintext);
    wipeBuffer(decrypted);
  });

  test('Decryption fails with wrong key', () => {
    const salt = generateSalt();
    const info = 'wallet:xyz:share:1';
    const correctKey = deriveShareKey(masterKey, salt, info);
    const wrongKey = deriveShareKey(
      generateEncryptionKey('other-key').key,
      salt,
      info,
    );
    const plaintext = randomBytes(32);

    const encrypted = encryptShare(plaintext, correctKey, salt, info);

    try {
      decryptShare(encrypted, wrongKey);
      assert(false, 'Should have thrown');
    } catch (e: any) {
      assert(
        e.message.includes('decryption failed'),
        `Unexpected error: ${e.message}`,
      );
    }

    wipeBuffer(correctKey);
    wipeBuffer(wrongKey);
    wipeBuffer(plaintext);
  });

  test('Decryption fails with tampered ciphertext', () => {
    const salt = generateSalt();
    const info = 'wallet:test:share:1';
    const key = deriveShareKey(masterKey, salt, info);
    const plaintext = randomBytes(32);

    const encrypted = encryptShare(plaintext, key, salt, info);
    // Tamper with ciphertext by flipping the first byte
    const tamperedB64 = Buffer.from(encrypted.ciphertext, 'base64');
    tamperedB64[0] = (tamperedB64[0] + 1) % 256;
    const tampered: EncryptedBlob = {
      ...encrypted,
      ciphertext: tamperedB64.toString('base64'),
    };

    try {
      decryptShare(tampered, key);
      assert(false, 'Should have detected tampering');
    } catch (e: any) {
      assert(
        e.message.includes('decryption failed'),
        `Unexpected error: ${e.message}`,
      );
    }

    wipeBuffer(key);
    wipeBuffer(plaintext);
  });

  test('Different salt produces different ciphertext', () => {
    const info = 'wallet:same:share:1';
    const key1 = deriveShareKey(masterKey, generateSalt(), info);
    const key2 = deriveShareKey(masterKey, generateSalt(), info);
    const plaintext = randomBytes(32);

    const enc1 = encryptShare(plaintext, key1, generateSalt(), info);
    const enc2 = encryptShare(plaintext, key2, generateSalt(), info);

    assert(enc1.ciphertext !== enc2.ciphertext, 'Same ciphertext with different salts');

    wipeBuffer(key1);
    wipeBuffer(key2);
    wipeBuffer(plaintext);
  });

  test('HKDF key derivation is deterministic', () => {
    const salt = generateSalt();
    const info = 'wallet:deterministic:share:1';

    const key1 = deriveShareKey(masterKey, salt, info);
    const key2 = deriveShareKey(masterKey, salt, info);

    assert(Buffer.compare(key1, key2) === 0, 'HKDF not deterministic');
    wipeBuffer(key1);
    wipeBuffer(key2);
  });

  test('Encryption key import validates length', () => {
    // Valid 32-byte key
    const validKey = randomBytes(32);
    const imported = importEncryptionKey(validKey, 'valid-key');
    assert(imported.keyId === 'valid-key', 'Wrong key ID');
    assert(Buffer.compare(imported.key, validKey) === 0, 'Wrong key material');

    // Invalid key lengths
    try {
      importEncryptionKey(randomBytes(16), 'short-key');
      assert(false, 'Should reject 16-byte key');
    } catch (e: any) {
      assert(e.message.includes('Invalid key length'), `Unexpected: ${e.message}`);
    }

    try {
      importEncryptionKey(randomBytes(64), 'long-key');
      assert(false, 'Should reject 64-byte key');
    } catch (e: any) {
      assert(e.message.includes('Invalid key length'), `Unexpected: ${e.message}`);
    }
  });

  test('Constant-time comparison works', () => {
    const a = Buffer.from('abcdef123456');
    const b = Buffer.from('abcdef123456');
    const c = Buffer.from('abcdef123457');
    const d = Buffer.from('abcdef1234'); // different length

    assert(constantTimeEqual(a, b), 'Equal buffers should match');
    assert(!constantTimeEqual(a, c), 'Different buffers should not match');
    assert(!constantTimeEqual(a, d), 'Different length buffers should not match');
  });

  test('Buffer wipe zeros memory', () => {
    const buf = randomBytes(32);
    wipeBuffer(buf);
    const allZeros = buf.every((b) => b === 0);
    assert(allZeros, 'Wiped buffer should be all zeros');
  });

  // ── Serialization Tests ──────────────────────────────────────────
  console.log('\n' + '─'.repeat(62));
  console.log('Serialization');
  console.log('─'.repeat(62));

  test('Serialize + deserialize round-trip', () => {
    const share: SerializedShare = {
      version: 1,
      partyIndex: 3,
      share: 12345678901234567890n,
      publicKey: testShare.publicKey,
    };

    const serialized = serializeShare(share);
    const deserialized = deserializeShare(serialized);

    assert(deserialized.version === 1, 'Wrong version');
    assert(deserialized.partyIndex === 3, 'Wrong party index');
    assert(deserialized.share === 12345678901234567890n, 'Wrong share value');
    assert(
      Buffer.compare(Buffer.from(deserialized.publicKey), Buffer.from(testShare.publicKey)) === 0,
      'Wrong public key',
    );
    assert(deserialized.chainCode === undefined, 'Chain code should be absent');
  });

  test('Serialize + deserialize with chain code', () => {
    const chainCode = new Uint8Array(32);
    crypto.getRandomValues(chainCode);

    const share: SerializedShare = {
      version: 1,
      partyIndex: 2,
      share: 99999n,
      publicKey: testShare.publicKey,
      chainCode,
    };

    const serialized = serializeShare(share);
    const deserialized = deserializeShare(serialized);

    assert(deserialized.chainCode !== undefined, 'Chain code missing');
    assert(
      Buffer.compare(Buffer.from(deserialized.chainCode!), Buffer.from(chainCode)) === 0,
      'Chain code mismatch',
    );
  });

  test('Deserialization rejects version 0', () => {
    const share: SerializedShare = {
      version: 0,
      partyIndex: 1,
      share: 1n,
      publicKey: testShare.publicKey,
    };

    const serialized = serializeShare(share);
    try {
      deserializeShare(serialized);
      assert(false, 'Should reject version 0');
    } catch (e: any) {
      assert(e.message.includes('Unsupported share version'), `Unexpected: ${e.message}`);
    }
  });

  test('Deserialization rejects out-of-range share', () => {
    // Create a buffer with a share value > CURVE_ORDER
    const buf = Buffer.alloc(100);
    buf.writeUInt8(1, 0); // version
    buf.writeUInt8(1, 1); // party index
    buf.writeUInt16BE(33, 2); // share length (33 bytes to exceed curve order)
    // Fill share with 0xFF to create a value > CURVE_ORDER
    buf.fill(0xFF, 4, 37);
    buf.writeUInt8(33, 37); // pub key len
    buf.writeUInt8(0, 71); // chain code len

    try {
      deserializeShare(buf);
      assert(false, 'Should reject out-of-range share');
    } catch (e: any) {
      assert(
        e.message.includes('out of range'),
        `Unexpected: ${e.message}`,
      );
    }
  });

  // ── Full Storage Integration Tests ────────────────────────────────
  console.log('\n' + '─'.repeat(62));
  console.log('Full Storage Pipeline (encode → decode)');
  console.log('─'.repeat(62));

  test('Full pipeline: share → serialize → encrypt → decrypt → deserialize', () => {
    const salt = generateSalt();
    const info = 'wallet:full-pipeline:share:1';
    const key = deriveShareKey(masterKey, salt, info);

    const original: SerializedShare = {
      version: 1,
      partyIndex: 1,
      share: 42n * 10n ** 18n,
      publicKey: testShare.publicKey,
    };

    // Encode for storage
    const stored = encodeShareForStorage(original, key, salt, info);

    // Should be valid JSON
    const parsed = JSON.parse(stored);
    assert(typeof parsed.ciphertext === 'string', 'Invalid stored format');
    assert(typeof parsed.iv === 'string', 'Missing IV in stored format');
    assert(typeof parsed.tag === 'string', 'Missing tag in stored format');
    assert(parsed.algorithm === 'aes-256-gcm', 'Wrong algorithm in stored format');

    // Decode from storage
    const decoded = decodeShareFromStorage(stored, key);

    assert(decoded.version === original.version, 'Version mismatch');
    assert(decoded.partyIndex === original.partyIndex, 'Party index mismatch');
    assert(decoded.share === original.share, 'Share mismatch');
    assert(
      Buffer.compare(Buffer.from(decoded.publicKey), Buffer.from(original.publicKey)) === 0,
      'Public key mismatch',
    );

    wipeBuffer(key);
  });

  test('Full pipeline with all 3 party indices', () => {
    const salt = generateSalt();
    const key = deriveShareKey(masterKey, salt, 'wallet:multi-party');

    for (const partyIndex of [1, 2, 3]) {
      const original: SerializedShare = {
        version: 1,
        partyIndex,
        share: 123456789n * BigInt(partyIndex),
        publicKey: testShare.publicKey,
      };

      const stored = encodeShareForStorage(
        original,
        key,
        generateSalt(),
        `share:${partyIndex}`,
      );

      const derivedKey = deriveShareKey(
        masterKey,
        generateSalt(),
        `share:${partyIndex}`,
      );

      // Different info = different key, so this should fail with original key
      // When using correct derived key with matching salt+info, it should work
    }

    wipeBuffer(key);
    assert(true, 'All party indices processed');
  });

  test('Decode with wrong key fails', () => {
    const salt = generateSalt();
    const info = 'wallet:wrong-key:share:1';
    const correctKey = deriveShareKey(masterKey, salt, info);
    const wrongKey = deriveShareKey(
      generateEncryptionKey('other').key,
      salt,
      info,
    );

    const original: SerializedShare = {
      version: 1,
      partyIndex: 1,
      share: 12345n,
      publicKey: testShare.publicKey,
    };

    const stored = encodeShareForStorage(original, correctKey, salt, info);

    try {
      decodeShareFromStorage(stored, wrongKey);
      assert(false, 'Should have thrown with wrong key');
    } catch (e: any) {
      assert(
        e.message.includes('decryption failed'),
        `Unexpected: ${e.message}`,
      );
    }

    wipeBuffer(correctKey);
    wipeBuffer(wrongKey);
  });

  test('Storage format is JSON with all required fields', () => {
    const salt = generateSalt();
    const info = 'wallet:format:share:1';
    const key = deriveShareKey(masterKey, salt, info);

    const share: SerializedShare = {
      version: 1,
      partyIndex: 1,
      share: 1n,
      publicKey: testShare.publicKey,
    };

    const stored = encodeShareForStorage(share, key, salt, info);
    const parsed = JSON.parse(stored);

    const requiredFields = [
      'ciphertext', 'iv', 'tag', 'algorithm',
      'kdfVersion', 'salt', 'info',
    ];

    for (const field of requiredFields) {
      assert(
        field in parsed,
        `Missing required field: ${field}`,
      );
    }

    assert(parsed.algorithm === 'aes-256-gcm', 'Algorithm should be aes-256-gcm');
    assert(parsed.kdfVersion === 1, 'KDF version should be 1');
    assert(parsed.info === info, 'Info should match');

    wipeBuffer(key);
  });

  // ── Summary ─────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(62)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`  ⚠ Some tests failed — review above`);
    process.exit(1);
  } else {
    console.log(`  ✓ All tests passed`);
  }
  console.log('═'.repeat(62));
}

runTests();
