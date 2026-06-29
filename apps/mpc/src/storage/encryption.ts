/**
 * AES-256-GCM encryption for MPC key shares
 *
 * Implements authenticated encryption for key share material at rest.
 * Uses Node.js built-in crypto module.
 *
 * Security:
 * - AES-256-GCM provides authenticated encryption (confidentiality + integrity)
 * - 12-byte random IV per encryption (NIST recommended for GCM)
 * - 16-byte authentication tag
 * - Key derivation via HKDF-SHA256 for per-share key material
 * - Constant-time comparison for MAC verification (built into GCM)
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  hkdfSync,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const HKDF_HASH = 'sha256';

export interface EncryptedBlob {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded authentication tag */
  tag: string;
  /** Algorithm identifier for future-proofing */
  algorithm: string;
  /** Key derivation version */
  kdfVersion: number;
  /** Salt used in HKDF key derivation (base64) */
  salt: string;
  /** Info parameter for HKDF (wallet-specific context) */
  info: string;
}

export interface EncryptionKey {
  /** Raw key material (must be kept secret, never logged) */
  key: Buffer;
  /** Unique identifier for this key (for KMS reference) */
  keyId: string;
  /** Key creation timestamp */
  createdAt: Date;
}

/**
 * Derive a per-share encryption key using HKDF.
 *
 * @param masterKey - The master encryption key (from KMS or env)
 * @param salt - Random salt (prevents key reuse across shares)
 * @param info - Context info (e.g., wallet ID + share index)
 * @returns Derived 256-bit key
 */
export function deriveShareKey(
  masterKey: Buffer,
  salt: Buffer,
  info: string,
): Buffer {
  const keyBuffer = hkdfSync(HKDF_HASH, masterKey, salt, info, KEY_LENGTH);
  return Buffer.from(keyBuffer);
}

/**
 * Encrypt a key share using AES-256-GCM.
 *
 * @param plaintext - The raw share bytes
 * @param key - 256-bit encryption key
 * @param salt - Salt used for key derivation (stored with ciphertext)
 * @param info - Key derivation context
 * @returns EncryptedBlob with all metadata needed for decryption
 */
export function encryptShare(
  plaintext: Buffer,
  key: Buffer,
  salt: Buffer,
  info: string,
): EncryptedBlob {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    algorithm: ALGORITHM,
    kdfVersion: 1,
    salt: salt.toString('base64'),
    info,
  };
}

/**
 * Decrypt a key share using AES-256-GCM.
 *
 * Throws if the authentication tag is invalid (detects tampering).
 *
 * @param blob - The encrypted blob with all metadata
 * @param key - 256-bit encryption key (must match the one used for encryption)
 * @returns Decrypted share bytes
 */
export function decryptShare(blob: EncryptedBlob, key: Buffer): Buffer {
  if (blob.algorithm !== ALGORITHM) {
    throw new Error(`Unsupported algorithm: ${blob.algorithm}`);
  }

  if (blob.kdfVersion !== 1) {
    throw new Error(`Unsupported KDF version: ${blob.kdfVersion}`);
  }

  const iv = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const ciphertext = Buffer.from(blob.ciphertext, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err: any) {
    throw new Error(
      `Share decryption failed: ${err.message}. ` +
      'Possible causes: wrong key, tampered data, or corrupted storage.',
    );
  }
}

/**
 * Generate a fresh encryption key.
 *
 * In production, this should delegate to a KMS (AWS KMS / GCP KMS).
 *
 * @param keyId - Optional KMS key identifier
 * @returns EncryptionKey object
 */
export function generateEncryptionKey(keyId?: string): EncryptionKey {
  const key = randomBytes(KEY_LENGTH);
  return {
    key,
    keyId: keyId ?? `local-${randomBytes(8).toString('hex')}`,
    createdAt: new Date(),
  };
}

/**
 * Create a key from raw bytes (for loading from KMS or env).
 */
export function importEncryptionKey(rawKey: Buffer, keyId: string): EncryptionKey {
  if (rawKey.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${rawKey.length}`);
  }
  return { key: rawKey, keyId, createdAt: new Date() };
}

/**
 * Generate random salt for HKDF.
 */
export function generateSalt(): Buffer {
  return randomBytes(32);
}

/**
 * Wipe a buffer securely (overwrite with zeros before GC).
 * Use this for any plaintext key material that leaves scope.
 */
export function wipeBuffer(buf: Buffer | Uint8Array): void {
  for (let i = 0; i < buf.length; i++) {
    buf[i] = 0;
  }
}

/**
 * Constant-time buffer comparison for MAC/key verification.
 */
export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
