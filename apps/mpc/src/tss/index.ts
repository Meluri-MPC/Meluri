/**
 * VelumX MPC — Threshold Signature Scheme (TSS) Library

  * import { DkgCoordinator } from '@velumx/mpc/tss';
  * import { encodeShareForStorage, generateEncryptionKey } from '@velumx/mpc/storage';
 *
 * // 1. Generate key shares via DKG
 * const dkg = new DkgCoordinator('session-1', [1, 2, 3]);
 * const result = dkg.runFullDkg();
 *
 * // 2. Encrypt and store each share
 * const masterKey = generateEncryptionKey();
 * for (const [partyId, share] of result.shares) {
 *   const encoded = encodeShareForStorage(
 *     { version: 1, partyIndex: partyId, share, publicKey: result.publicKey },
 *     masterKey.key,
 *     generateSalt(),
 *     `wallet:${walletId}:share:${partyId}`,
 *   );
 *   // Store `encoded` in PostgreSQL key_shares table
 * }
 * ```
 *
 * ## Security Notes
 *
 * - Paillier key size: 512-bit for dev/testing, 2048-bit for production
 * - Shares encrypted with AES-256-GCM using HKDF-derived per-share keys
 * - Master encryption key should come from KMS (AWS KMS / GCP KMS)
 * - Feldman VSS commitments stored as hex-encoded compressed points
 * - Never log or serialize plaintext shares or encryption keys
 */

export { DkgCoordinator } from './dkg';
export {
  SigningCeremony,
  signStacksTransactionHash,
} from '../signing';
export {
  generatePaillierKeypair,
  encrypt,
  decrypt,
  add,
  scalarMul,
  serializePublicKey,
  deserializePublicKey,
  type PaillierPublicKey,
  type PaillierSecretKey,
  type PaillierKeyPair,
} from './paillier';
export type {
  PartyId,
  CommitmentSet,
  SchnorrProof,
  Round1Message,
  Round2Message,
  Round3Message,
  PartyState,
  PaillierProof,
  ShareProof,
  DkgSession,
  DkgResult,
} from './types';
