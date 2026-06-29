/**
 * Recovery Orchestrator — end-to-end wallet recovery flow.
 *
 * Flow:
 *   1. CREATE: generateMnemonic() → show to user → verify → deriveRecoveryKey()
 *   2. BACKUP: createRecoveryBundle(walletId, shares, recoveryKey) → store in DB
 *   3. RECOVER: user enters mnemonic → mnemonicToEntropy → validateMnemonic()
 *   4. DECRYPT: recoverKey(mnemonic, storedSalt, iterations) → decryptRecoveryBundle()
 *   5. RESTORE: redistribute shares to MPC nodes
 */

import type {
  MnemonicPhrase,
  RecoveryKey,
  RecoveryBundle,
  RecoveryVerification,
  RecoveryConfig,
} from './types';
import { DEFAULT_RECOVERY_CONFIG } from './types';
import {
  generateMnemonic,
  validateMnemonic,
  generateVerificationChallenge,
  verifyChallengeResponse,
  mnemonicToEntropy,
} from './mnemonic';
import {
  deriveRecoveryKey,
  recoverKey,
} from './key-derivation';
import {
  createRecoveryBundle,
  decryptRecoveryBundle,
  serializeBundle,
  deserializeBundle,
} from './bundle';
import type { SerializedShare } from '../storage/share-serializer';

// ─── Orchestrator ─────────────────────────────────────────────────────────

export class RecoveryOrchestrator {
  private config: RecoveryConfig;

  constructor(config?: Partial<RecoveryConfig>) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
  }

  // ── Wallet Creation Flow ────────────────────────────────────────────

  /**
   * Step 1: Generate a new mnemonic phrase.
   * The caller must display these words to the user.
   */
  createMnemonic(): MnemonicPhrase {
    return generateMnemonic(
      this.config.wordCount === 12
        ? new Uint8Array(16) // Will be filled by generateMnemonic
        : new Uint8Array(32),
    );
  }

  /**
   * Step 2: Generate a verification challenge.
   * Ask the user to re-enter words at specific positions.
   */
  createVerificationChallenge(): RecoveryVerification {
    return generateVerificationChallenge(this.config.wordCount);
  }

  /**
   * Step 3: Verify the user's challenge responses.
   */
  verifyChallenge(
    mnemonic: MnemonicPhrase,
    challenge: RecoveryVerification,
    responses: [string, string, string],
  ): boolean {
    return verifyChallengeResponse(mnemonic, challenge, responses);
  }

  /**
   * Step 4: Derive the recovery key from the mnemonic.
   */
  deriveKey(mnemonic: MnemonicPhrase): RecoveryKey {
    return deriveRecoveryKey(mnemonic.words);
  }

  /**
   * Step 5: Create the encrypted backup bundle.
   */
  createBackup(
    walletId: string,
    shares: Map<number, SerializedShare>,
    recoveryKey: RecoveryKey,
  ): { bundle: RecoveryBundle; serialized: string } {
    const bundle = createRecoveryBundle(walletId, shares, recoveryKey);
    return {
      bundle,
      serialized: serializeBundle(bundle),
    };
  }

  // ── Wallet Recovery Flow ────────────────────────────────────────────

  /**
   * Step 1: Validate the user's entered mnemonic.
   */
  validateRecoveryMnemonic(words: string[]): boolean {
    return validateMnemonic(words);
  }

  /**
   * Step 2: Re-derive the recovery key from mnemonic + stored parameters.
   */
  deriveKeyFromStoredParams(
    words: string[],
    storedSalt: string,
    iterations: number,
  ): RecoveryKey {
    const saltBytes = Buffer.from(storedSalt, 'base64');
    return recoverKey(words, saltBytes, iterations);
  }

  /**
   * Step 3: Decrypt the recovery bundle.
   */
  recoverShares(
    serialized: string,
    recoveryKey: RecoveryKey,
  ): Map<number, SerializedShare> {
    const bundle = deserializeBundle(serialized);
    return decryptRecoveryBundle(bundle, recoveryKey);
  }

  /**
   * Full recovery: mnemonic words → shares.
   */
  fullRecovery(
    words: string[],
    storedSalt: string,
    iterations: number,
    serialized: string,
  ): Map<number, SerializedShare> {
    const recoveryKey = this.deriveKeyFromStoredParams(words, storedSalt, iterations);
    return this.recoverShares(serialized, recoveryKey);
  }

  // ── Utility ─────────────────────────────────────────────────────────

  getConfig(): RecoveryConfig {
    return { ...this.config };
  }
}

// ─── Re-export ────────────────────────────────────────────────────────────

export {
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
};

export type {
  MnemonicPhrase,
  RecoveryKey,
  RecoveryBundle,
  RecoveryVerification,
  RecoveryConfig,
};

// ─── Social Recovery ──────────────────────────────────────────────────────

export {
  SocialRecoveryManager,
  createSocialRecovery,
} from './social';

export type {
  Guardian,
  SocialRecoveryConfig,
  RecoveryRequest,
  RecoveryRequestStatus,
  GuardianApproval,
  RecoveryNotification,
  SocialRecoveryResult,
} from './social/types';

// ─── Server-Side Recovery ─────────────────────────────────────────────────

export {
  ServerRecoveryManager,
  DEFAULT_SERVER_RECOVERY_CONFIG,
} from './server';

export type {
  ServerRecoveryConfig,
  ServerRecoveryRequest,
  ServerRecoveryResponse,
  ServerRecoveryErrorCode,
} from './server';
