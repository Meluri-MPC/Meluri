/**
 * KMS — Key Management Service abstraction layer.
 *
 * Provides a unified interface for share encryption/decryption across
 * different KMS backends (local, AWS KMS, GCP KMS).
 *
 * Usage:
 *   import { createKmsProvider } from '../kms';
 *   const kms = createKmsProvider({ type: 'local' });
 *   const encrypted = await kms.encrypt(plaintext, 'wallet-123:share:1');
 *   const decrypted = await kms.decrypt(encrypted, 'wallet-123:share:1');
 */

import type { KmsProvider, KmsConfig, KmsEncryptedBlob } from './types';
import { LocalKmsProvider } from './local';
import { AwsKmsProvider } from './aws';
import { GcpKmsProvider } from './gcp';

// ─── Provider Factory ────────────────────────────────────────────────────

/**
 * Create the appropriate KMS provider from configuration.
 *
 * @example
 *   // Local development
 *   const kms = createKmsProvider({ type: 'local' });
 *
 *   // AWS KMS
 *   const kms = createKmsProvider({
 *     type: 'aws-kms',
 *     awsKeyArn: 'arn:aws:kms:us-east-1:123456789:key/abc-123',
 *   });
 *
 *   // GCP KMS
 *   const kms = createKmsProvider({
 *     type: 'gcp-kms',
 *     gcpProjectId: 'my-project',
 *     gcpKeyRing: 'mpc-keys',
 *     gcpKeyName: 'share-encryption-key',
 *   });
 */
export function createKmsProvider(config: KmsConfig): KmsProvider {
  switch (config.type) {
    case 'local':
      return new LocalKmsProvider({
        keyPath: config.localKeyPath,
      });

    case 'aws-kms':
      if (!config.awsKeyArn && process.env.NODE_ENV === 'production') {
        throw new Error('AWS KMS requires awsKeyArn in production');
      }
      return new AwsKmsProvider({
        keyArn: config.awsKeyArn ?? 'arn:aws:kms:us-east-1:000000000000:key/mock-key',
        region: config.awsRegion,
        mock: process.env.NODE_ENV !== 'production',
      });

    case 'gcp-kms':
      if (!config.gcpProjectId && process.env.NODE_ENV === 'production') {
        throw new Error('GCP KMS requires gcpProjectId in production');
      }
      return new GcpKmsProvider({
        projectId: config.gcpProjectId ?? 'mock-project',
        keyRing: config.gcpKeyRing ?? 'mpc-share-keys',
        keyName: config.gcpKeyName ?? 'share-encryption-key',
        location: config.gcpLocation,
        mock: process.env.NODE_ENV !== 'production',
      });

    default:
      throw new Error(`Unknown KMS provider type: ${(config as any).type}`);
  }
}

/**
 * Create a KMS provider from environment variables.
 *
 * Reads:
 *   KMS_PROVIDER = local | aws-kms | gcp-kms
 *   AWS_KMS_KEY_ARN (for aws-kms)
 *   AWS_REGION (for aws-kms)
 *   GCP_PROJECT_ID, GCP_KMS_KEY_RING, GCP_KMS_KEY_NAME, GCP_KMS_LOCATION (for gcp-kms)
 */
export function createKmsProviderFromEnv(): KmsProvider {
  const type = (process.env.KMS_PROVIDER ?? 'local') as KmsConfig['type'];

  return createKmsProvider({
    type,
    localKeyPath: process.env.KMS_LOCAL_KEY_PATH,
    awsKeyArn: process.env.AWS_KMS_KEY_ARN,
    awsRegion: process.env.AWS_REGION,
    gcpProjectId: process.env.GCP_PROJECT_ID,
    gcpKeyRing: process.env.GCP_KMS_KEY_RING,
    gcpKeyName: process.env.GCP_KMS_KEY_NAME,
    gcpLocation: process.env.GCP_KMS_LOCATION,
    enableAudit: true,
  });
}

// ─── Re-export ────────────────────────────────────────────────────────────

export {
  LocalKmsProvider,
  AwsKmsProvider,
  GcpKmsProvider,
};

export type { KmsProvider, KmsConfig, KmsEncryptedBlob };
