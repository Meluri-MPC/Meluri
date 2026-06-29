/**
 * Recovery Key Derivation — PBKDF2 with 600,000 iterations.
 *
 * Derives an AES-256 encryption key from a BIP39 mnemonic phrase,
 * using PBKDF2-SHA512 with a salt.
 *
 * Security:
 *   - 600,000 iterations of PBKDF2 (NIST SP 800-132 recommended for 2024+)
 *   - Salt: 32 random bytes, stored with the recovery bundle
 *   - Derived key: 32 bytes (AES-256)
 */

import { pbkdf2Sync, randomBytes } from 'crypto';
import type { RecoveryKey } from './types';
import { DEFAULT_RECOVERY_CONFIG } from './types';

// ─── Key Derivation ───────────────────────────────────────────────────────

/**
 * Derive a recovery encryption key from a mnemonic phrase.
 *
 * Uses: PBKDF2(passphrase: mnemonic, salt, iterations=600000, keylen=32, digest=sha512)
 *
 * @param mnemonic - Space-separated mnemonic words (or the words array)
 * @param salt - 32-byte random salt (generated if not provided)
 * @param iterations - PBKDF2 iteration count
 */
export function deriveRecoveryKey(
  mnemonic: string | string[],
  salt?: Uint8Array,
  iterations?: number,
): RecoveryKey {
  const passphrase = Array.isArray(mnemonic) ? mnemonic.join(' ') : mnemonic;
  const saltBytes = salt ?? randomBytes(32);
  const iter = iterations ?? DEFAULT_RECOVERY_CONFIG.pbkdf2Iterations;

  const derivedKey = pbkdf2Sync(
    passphrase,
    Buffer.from(saltBytes),
    iter,
    32, // AES-256 key length
    'sha512',
  );

  return {
    key: new Uint8Array(derivedKey),
    keyHex: derivedKey.toString('hex'),
    salt: new Uint8Array(saltBytes),
    iterations: iter,
    hash: 'sha512',
  };
}

/**
 * Generate a random salt for PBKDF2.
 */
export function generateSalt(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

/**
 * Re-derive the same key from mnemonic + stored salt + iterations.
 * Used during recovery to decrypt the bundle.
 */
export function recoverKey(
  mnemonic: string | string[],
  storedSalt: Uint8Array | string,
  iterations: number,
): RecoveryKey {
  const saltBytes = typeof storedSalt === 'string'
    ? Buffer.from(storedSalt, 'hex')
    : Buffer.from(storedSalt);

  return deriveRecoveryKey(mnemonic, saltBytes, iterations);
}
