/**
 * Recovery Types — mnemonic, recovery bundle, backup configuration.
 */

// ─── Mnemonic ─────────────────────────────────────────────────────────────

export interface MnemonicPhrase {
  /** The 12-word mnemonic phrase */
  words: string[];
  /** Original entropy (16 bytes) used to generate the phrase */
  entropy: Uint8Array;
  /** Hex-encoded entropy for verification */
  entropyHex: string;
}

// ─── Recovery Key ────────────────────────────────────────────────────────

export interface RecoveryKey {
  /** The derived AES-256 key (32 bytes) */
  key: Uint8Array;
  /** Hex-encoded key */
  keyHex: string;
  /** Salt used in PBKDF2 derivation */
  salt: Uint8Array;
  /** PBKDF2 iteration count */
  iterations: number;
  /** Hash algorithm used */
  hash: 'sha512';
}

// ─── Recovery Bundle ─────────────────────────────────────────────────────

export interface RecoveryBundle {
  /** Unique bundle ID */
  id: string;
  /** Wallet ID this bundle belongs to */
  walletId: string;
  /** Salt for PBKDF2 derivation */
  salt: string;
  /** PBKDF2 iteration count */
  iterations: number;
  /** Encrypted share data (one entry per party) */
  shares: EncryptedShareEntry[];
  /** Bundle creation timestamp */
  createdAt: number;
  /** Bundle version */
  version: number;
}

export interface EncryptedShareEntry {
  /** Party index (1, 2, or 3) */
  partyIndex: number;
  /** AES-256-GCM encrypted share blob */
  encryptedShare: string;
  /** IV used for this share's encryption */
  iv: string;
  /** Authentication tag */
  tag: string;
  /** Public key associated with this share */
  publicKey: string;
}

// ─── Recovery Verification ───────────────────────────────────────────────

export interface RecoveryVerification {
  /** Request 3 specific word indices for the user to re-enter */
  requestedIndices: [number, number, number];
  /** Hashed versions of the expected words (for comparison) */
  expectedHashes?: string[];
}

// ─── Backup Config ────────────────────────────────────────────────────────

export interface RecoveryConfig {
  /** Number of words in the mnemonic (12 or 24) */
  wordCount: 12 | 24;
  /** PBKDF2 iteration count (default: 600,000) */
  pbkdf2Iterations: number;
  /** Whether to show the mnemonic to the user */
  showMnemonic: boolean;
  /** Whether to require mnemonic re-confirmation */
  requireConfirmation: boolean;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  wordCount: 12,
  pbkdf2Iterations: 600000,
  showMnemonic: true,
  requireConfirmation: true,
};
