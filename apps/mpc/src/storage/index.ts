/**
 * Key Share Storage Module
 *
 * Handles secure persistence of MPC key shares:
 * - AES-256-GCM encryption at rest with HKDF key derivation
 * - Binary serialization format with versioning
 * - Integration with PostgreSQL via Prisma (KeyShare model)
 *
 * ## Security Architecture
 *
 *   Master Key (KMS)
 *       │
 *       ▼ HKDF(wallet_id, share_index)
 *   Per-Share Key ──▶ AES-256-GCM encrypt(serialized_share)
 *       │
 *       ▼
 *   EncryptedBlob (JSON) → PostgreSQL key_shares.encrypted_share
 *
 * No plaintext shares are ever stored. Encryption keys are derived from a
 * master key stored in KMS and never touch disk in plaintext.
 *
 * ## Usage
 *
 * ```typescript
 * import { storeKeyShare, loadKeyShare } from '@velumx/mpc/storage';
 *
 * // Store a share after DKG
 * await storeKeyShare(prisma, {
 *   walletId: 'wallet_abc',
 *   orgId: 'org_xyz',
 *   shareIndex: 1,
 *   holderId: 'client',
 *   share: dkgResult.shares.get(1),
 *   publicKey: dkgResult.publicKey,
 *   dkgSessionId: 'dkg_session_123',
 *   masterKey: kmsKey,
 * });
 *
 * // Load a share for signing
 * const share = await loadKeyShare(prisma, 'wallet_abc', 1, kmsKey);
 * // share.share — decrypted share bigint
 * // share.publicKey — joint public key
 * ```
 */

export {
  encryptShare,
  decryptShare,
  deriveShareKey,
  generateEncryptionKey,
  generateSalt,
  importEncryptionKey,
  wipeBuffer,
  constantTimeEqual,
  type EncryptedBlob,
  type EncryptionKey,
} from './encryption';

export {
  serializeShare,
  deserializeShare,
  encodeShareForStorage,
  decodeShareFromStorage,
  type SerializedShare,
} from './share-serializer';
