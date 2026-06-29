/**
 * Local KMS — file-based AES-256 key for development only.
 *
 * Gated by NODE_ENV !== 'production'.
 * Uses the existing encryption primitives from storage/encryption.ts
 * but wraps them with KMS provider semantics (key management, rotation, audit).
 *
 * In production, this provider throws — use AWS KMS or GCP KMS instead.
 */

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
} from 'crypto';
import type { KmsProvider, KmsEncryptedBlob, KeyMetadata } from './types';
import { AuditLogger, getAuditLogger } from './audit';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface LocalKmsOptions {
  /** Pre-existing key as hex string */
  keyHex?: string;
  /** File path for key (dev): not actually read, just tracked in metadata */
  keyPath?: string;
  /** Audit logger instance */
  audit?: AuditLogger;
}

export class LocalKmsProvider implements KmsProvider {
  readonly type = 'local' as const;

  private masterKey: Buffer;
  private keyId: string;
  private createdAt: Date;
  private version: number;
  private audit: AuditLogger;

  constructor(options: LocalKmsOptions = {}) {
    // Gate: only allow in development
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'LocalKmsProvider is not allowed in production. Use AwsKmsProvider or GcpKmsProvider.',
      );
    }

    this.masterKey = options.keyHex
      ? Buffer.from(options.keyHex, 'hex')
      : randomBytes(KEY_LENGTH);

    if (this.masterKey.length !== KEY_LENGTH) {
      throw new Error(`Invalid key length: expected ${KEY_LENGTH}, got ${this.masterKey.length}`);
    }

    this.keyId = options.keyPath ?? `local-kms-dev-${randomBytes(4).toString('hex')}`;
    this.createdAt = new Date();
    this.version = 1;
    this.audit = options.audit ?? getAuditLogger();
  }

  async encrypt(plaintext: Buffer, context: string): Promise<KmsEncryptedBlob> {
    const start = Date.now();
    try {
      const iv = randomBytes(IV_LENGTH);
      const salt = randomBytes(32);
      const derivedKey = Buffer.from(hkdfSync('sha256', this.masterKey, salt, context, KEY_LENGTH));

      const cipher = createCipheriv(ALGORITHM, derivedKey, iv, { authTagLength: TAG_LENGTH });
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();

      this.audit.log('encrypt', 'local', this.keyId, {
        success: true,
        context,
        durationMs: Date.now() - start,
      });

      // Wipe derived key from memory
      derivedKey.fill(0);

      return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        algorithm: ALGORITHM,
        kdfVersion: 1,
        salt: salt.toString('base64'),
        info: context,
        kmsKeyId: this.keyId,
        provider: 'local',
      };
    } catch (error: any) {
      this.audit.log('encrypt', 'local', this.keyId, {
        success: false,
        context,
        error: error.message,
        durationMs: Date.now() - start,
      });
      throw error;
    }
  }

  async decrypt(blob: KmsEncryptedBlob, context: string): Promise<Buffer> {
    const start = Date.now();
    try {
      if (blob.algorithm !== ALGORITHM) {
        throw new Error(`Unsupported algorithm: ${blob.algorithm}`);
      }

      const iv = Buffer.from(blob.iv, 'base64');
      const tag = Buffer.from(blob.tag, 'base64');
      const ciphertext = Buffer.from(blob.ciphertext, 'base64');
      const salt = Buffer.from(blob.salt, 'base64');
      const derivedKey = Buffer.from(hkdfSync('sha256', this.masterKey, salt, context, KEY_LENGTH));

      const decipher = createDecipheriv(ALGORITHM, derivedKey, iv, { authTagLength: TAG_LENGTH });
      decipher.setAuthTag(tag);

      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      this.audit.log('decrypt', 'local', this.keyId, {
        success: true,
        context,
        durationMs: Date.now() - start,
      });

      // Wipe derived key
      derivedKey.fill(0);

      return plaintext;
    } catch (error: any) {
      this.audit.log('decrypt', 'local', this.keyId, {
        success: false,
        context,
        error: error.message,
        durationMs: Date.now() - start,
      });

      throw new Error(
        `Share decryption failed: ${error.message}. ` +
        'Possible causes: wrong key, tampered data, or corrupted storage.',
      );
    }
  }

  async getKeyMetadata(): Promise<KeyMetadata> {
    return {
      keyId: this.keyId,
      provider: 'local',
      createdAt: this.createdAt,
      lastRotated: this.createdAt,
      isActive: true,
      version: this.version,
      purpose: 'mpc-share-encryption',
      tags: { environment: 'development' },
    };
  }

  async listKeys(): Promise<KeyMetadata[]> {
    return [await this.getKeyMetadata()];
  }

  async healthCheck(): Promise<boolean> {
    return true; // local KMS is always available
  }

  async rotateKey(): Promise<void> {
    const oldKey = this.masterKey;
    this.masterKey = randomBytes(KEY_LENGTH);
    this.version++;
    oldKey.fill(0);

    this.audit.log('key_rotate', 'local', this.keyId, {
      success: true,
      context: `Version bumped to ${this.version}`,
    });
  }

  onAudit(handler: (entry: any) => void): void {
    this.audit.on('audit', handler);
  }

  /**
   * Get the raw master key (for storage integration).
   * MUST be wiped after use.
   */
  getMasterKey(): Buffer {
    return this.masterKey;
  }

  /**
   * Get the key as hex string (for storage/export).
   */
  exportKeyHex(): string {
    return this.masterKey.toString('hex');
  }
}
