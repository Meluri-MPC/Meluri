/**
 * KMS Types — key provider interface, key metadata, audit events.
 */

// ─── Key Metadata ─────────────────────────────────────────────────────────

export type KmsProviderType = 'local' | 'aws-kms' | 'gcp-kms';

export interface KeyMetadata {
  /** Unique key identifier (AWS: ARN, GCP: resource name, local: file path) */
  keyId: string;
  /** Provider type */
  provider: KmsProviderType;
  /** Creation timestamp */
  createdAt: Date;
  /** Last rotation timestamp */
  lastRotated: Date;
  /** Whether this is the current active key */
  isActive: boolean;
  /** Key version number */
  version: number;
  /** Associated key ring / key group */
  keyRing?: string;
  /** Purpose of this key */
  purpose: 'mpc-share-encryption';
  /** Tags / labels */
  tags: Record<string, string>;
}

// ─── Encryption Envelope ─────────────────────────────────────────────────

/**
 * Encrypted data envelope returned by a KMS provider.
 *
 * Unlike the raw AES-256-GCM EncryptedBlob from storage/encryption.ts,
 * this includes KMS-specific metadata needed for decryption.
 */
export interface KmsEncryptedBlob {
  /** Base64-encoded ciphertext (AES-256-GCM) */
  ciphertext: string;
  /** Base64-encoded IV */
  iv: string;
  /** Base64-encoded auth tag */
  tag: string;
  /** Algorithm identifier */
  algorithm: 'aes-256-gcm';
  /** KDF version */
  kdfVersion: number;
  /** Base64-encoded HKDF salt */
  salt: string;
  /** HKDF info context (wallet + share identifier) */
  info: string;
  /** KMS key ID used for encryption */
  kmsKeyId: string;
  /** Encrypted data encryption key (DEK) — for envelope encryption with cloud KMS */
  encryptedDek?: string;
  /** Provider that performed the encryption */
  provider: KmsProviderType;
}

// ─── Audit Events ────────────────────────────────────────────────────────

export type AuditAction = 'encrypt' | 'decrypt' | 'key_create' | 'key_rotate' | 'key_revoke' | 'access_denied';

export interface AuditLogEntry {
  /** Unique event ID */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Action performed */
  action: AuditAction;
  /** KMS provider type */
  provider: KmsProviderType;
  /** Key ID accessed */
  keyId: string;
  /** Context / wallet identifier (never logged: plaintext or key material) */
  context?: string;
  /** Principal / service account */
  principal?: string;
  /** Source IP or host */
  source?: string;
  /** Success or failure */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Duration in ms */
  durationMs?: number;
}

// ─── Provider Interface ──────────────────────────────────────────────────

export interface KmsProvider {
  /** Provider type identifier */
  readonly type: KmsProviderType;

  /**
   * Encrypt plaintext using a key managed by this KMS.
   *
   * @param plaintext - Raw bytes to encrypt
   * @param context - Descriptive context for audit (wallet ID, share index)
   * @returns Encrypted envelope with all metadata for decryption
   */
  encrypt(plaintext: Buffer, context: string): Promise<KmsEncryptedBlob>;

  /**
   * Decrypt an encrypted envelope using the KMS-managed key.
   *
   * @param blob - The encrypted envelope from encrypt()
   * @param context - Descriptive context for audit
   * @returns Decrypted plaintext bytes
   */
  decrypt(blob: KmsEncryptedBlob, context: string): Promise<Buffer>;

  /**
   * Get the current active key's metadata.
   */
  getKeyMetadata(): Promise<KeyMetadata>;

  /**
   * Get all key versions (current + previous).
   */
  listKeys(): Promise<KeyMetadata[]>;

  /**
   * Health check — can we reach the KMS?
   */
  healthCheck(): Promise<boolean>;

  /**
   * Rotate to a new key version.
   */
  rotateKey?(): Promise<void>;

  /**
   * Register an audit event handler.
   */
  onAudit?(handler: (entry: AuditLogEntry) => void): void;
}

// ─── KMS Configuration ──────────────────────────────────────────────────

export interface KmsConfig {
  /** Provider type */
  type: KmsProviderType;
  /** Local: file path for the key file */
  localKeyPath?: string;
  /** AWS: KMS key ARN */
  awsKeyArn?: string;
  /** AWS: region */
  awsRegion?: string;
  /** GCP: project ID */
  gcpProjectId?: string;
  /** GCP: key ring name */
  gcpKeyRing?: string;
  /** GCP: key name */
  gcpKeyName?: string;
  /** GCP: location */
  gcpLocation?: string;
  /** Enable audit logging */
  enableAudit?: boolean;
}

import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'crypto';

export { randomBytes, createCipheriv, createDecipheriv, hkdfSync };
