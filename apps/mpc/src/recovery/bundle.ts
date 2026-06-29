/**
 * Recovery Bundle — encrypts/decrypts all 3 MPC key shares using a recovery key.
 *
 * On wallet creation:
 *   1. Generate mnemonic → derive recovery key via PBKDF2
 *   2. Encrypt each of the 3 key shares with AES-256-GCM using the recovery key
 *   3. Store encrypted bundle in `key_shares.recovery_bundle` column
 *
 * On recovery:
 *   1. User provides mnemonic → re-derive recovery key via PBKDF2
 *   2. Decrypt each share from the bundle
 *   3. Redistribute shares to MPC nodes
 */

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'crypto';
import type { RecoveryKey, RecoveryBundle, EncryptedShareEntry } from './types';
import type { SerializedShare } from '../storage/share-serializer';
import { serializeShare, deserializeShare } from '../storage/share-serializer';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// ─── Bundle Creation ──────────────────────────────────────────────────────

/**
 * Create an encrypted recovery bundle from 3 key shares.
 *
 * @param walletId - The wallet identifier
 * @param shares - Map of partyIndex → SerializedShare (should have all 3)
 * @param recoveryKey - The derived PBKDF2 recovery key
 * @returns Encrypted RecoveryBundle ready for storage
 */
export function createRecoveryBundle(
  walletId: string,
  shares: Map<number, SerializedShare>,
  recoveryKey: RecoveryKey,
): RecoveryBundle {
  const entries: EncryptedShareEntry[] = [];

  for (const [partyIndex, share] of shares) {
    const serialized = serializeShare(share);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(
      ALGORITHM,
      Buffer.from(recoveryKey.key),
      iv,
      { authTagLength: TAG_LENGTH },
    );

    const ciphertext = Buffer.concat([cipher.update(serialized), cipher.final()]);
    const tag = cipher.getAuthTag();

    entries.push({
      partyIndex,
      encryptedShare: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      publicKey: Buffer.from(share.publicKey).toString('hex'),
    });
  }

  return {
    id: `recovery-${walletId}-${Date.now()}`,
    walletId,
    salt: Buffer.from(recoveryKey.salt).toString('base64'),
    iterations: recoveryKey.iterations,
    shares: entries,
    createdAt: Date.now(),
    version: 1,
  };
}

/**
 * Decrypt a recovery bundle using the recovery key.
 *
 * @param bundle - The encrypted recovery bundle from storage
 * @param recoveryKey - The re-derived recovery key (from mnemonic + stored salt + iterations)
 * @returns Map of partyIndex → SerializedShare
 */
export function decryptRecoveryBundle(
  bundle: RecoveryBundle,
  recoveryKey: RecoveryKey,
): Map<number, SerializedShare> {
  const shares = new Map<number, SerializedShare>();

  for (const entry of bundle.shares) {
    try {
      const iv = Buffer.from(entry.iv, 'base64');
      const tag = Buffer.from(entry.tag, 'base64');
      const ciphertext = Buffer.from(entry.encryptedShare, 'base64');

      const decipher = createDecipheriv(
        ALGORITHM,
        Buffer.from(recoveryKey.key),
        iv,
        { authTagLength: TAG_LENGTH },
      );
      decipher.setAuthTag(tag);

      const serialized = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      const deserialized = deserializeShare(serialized);

      // Verify public key matches
      const storedPk = Buffer.from(deserialized.publicKey).toString('hex');
      if (storedPk !== entry.publicKey) {
        throw new Error(
          `Share ${entry.partyIndex}: public key mismatch after decryption. ` +
          'Possible tampering or wrong recovery phrase.',
        );
      }

      shares.set(entry.partyIndex, deserialized);
    } catch (error: any) {
      throw new Error(
        `Failed to decrypt share ${entry.partyIndex}: ${error.message}`,
      );
    }
  }

  return shares;
}

/**
 * Serialize a recovery bundle to JSON for storage.
 */
export function serializeBundle(bundle: RecoveryBundle): string {
  return JSON.stringify(bundle);
}

/**
 * Deserialize a recovery bundle from stored JSON.
 */
export function deserializeBundle(json: string): RecoveryBundle {
  const parsed = JSON.parse(json);

  // Basic validation
  if (!parsed.id || !parsed.walletId || !Array.isArray(parsed.shares)) {
    throw new Error('Invalid recovery bundle format');
  }

  return parsed as RecoveryBundle;
}
