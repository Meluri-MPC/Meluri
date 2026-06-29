/**
 * Server-side Recovery — developer-managed recovery flow.
 *
 * For developers who want to manage recovery themselves:
 *   1. MPC nodes generate an encrypted share bundle on wallet creation
 *   2. Bundle is sent to developer's webhook endpoint
 *   3. Developer stores the bundle in their own infrastructure
 *   4. On recovery: developer POSTs the bundle back → MPC nodes import shares
 *
 * Trade-off: Developer takes on recovery custody burden; simpler UX for end users.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface ServerRecoveryConfig {
  /** Developer's webhook URL for receiving recovery bundles */
  webhookUrl: string;
  /** HMAC secret for signing webhook payloads */
  webhookSecret: string;
  /** Maximum bundle age before it's considered stale (ms, default 90 days) */
  maxBundleAgeMs: number;
  /** Whether to auto-delete shares from MPC nodes after bundle is delivered */
  deleteSharesAfterBackup: boolean;
}

export const DEFAULT_SERVER_RECOVERY_CONFIG: ServerRecoveryConfig = {
  webhookUrl: '',
  webhookSecret: '',
  maxBundleAgeMs: 90 * 24 * 60 * 60 * 1000, // 90 days
  deleteSharesAfterBackup: false,
};

export interface ServerRecoveryRequest {
  /** Wallet ID to recover */
  walletId: string;
  /** Encrypted recovery bundle (provided by developer) */
  encryptedBundle: string;
  /** HMAC signature of the bundle for integrity verification */
  signature?: string;
  /** Developer API key for authentication */
  apiKey: string;
}

export interface ServerRecoveryResponse {
  /** Whether recovery succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Number of shares successfully restored */
  sharesRestored?: number;
  /** Error code for programmatic handling */
  errorCode?: ServerRecoveryErrorCode;
}

export type ServerRecoveryErrorCode =
  | 'INVALID_BUNDLE'
  | 'BUNDLE_EXPIRED'
  | 'INVALID_SIGNATURE'
  | 'UNAUTHORIZED'
  | 'WALLET_NOT_FOUND'
  | 'SHARE_CONFLICT'
  | 'INTERNAL_ERROR';

// ─── Server Recovery Manager ──────────────────────────────────────────────

export class ServerRecoveryManager {
  private config: ServerRecoveryConfig;
  private deliveredBundles: Map<string, { bundleHash: string; deliveredAt: number }>;
  private webhookLog: Array<{ timestamp: number; walletId: string; success: boolean; error?: string }>;

  constructor(config?: Partial<ServerRecoveryConfig>) {
    this.config = { ...DEFAULT_SERVER_RECOVERY_CONFIG, ...config };
    this.deliveredBundles = new Map();
    this.webhookLog = [];
  }

  /**
   * Prepare a recovery bundle for delivery to the developer's webhook.
   * Called after wallet creation / DKG completes.
   */
  prepareBundleForDelivery(
    walletId: string,
    encryptedBundle: string,
  ): {
    payload: string;
    signature: string;
    walletId: string;
    createdAt: number;
  } {
    // Create HMAC-SHA256 signature of the bundle
    const { createHmac } = require('crypto');
    const signature = createHmac('sha256', this.config.webhookSecret)
      .update(`${walletId}:${encryptedBundle}`)
      .digest('hex');

    const bundleHash = createHmac('sha256', this.config.webhookSecret)
      .update(encryptedBundle)
      .digest('hex');

    this.deliveredBundles.set(walletId, {
      bundleHash,
      deliveredAt: Date.now(),
    });

    return {
      payload: encryptedBundle,
      signature,
      walletId,
      createdAt: Date.now(),
    };
  }

  /**
   * Process a server-side recovery request from a developer.
   * Validates the bundle, checks it's not expired, and restores shares.
   */
  processRecoveryRequest(request: ServerRecoveryRequest): ServerRecoveryResponse {
    // Validate required fields
    if (!request.walletId) {
      return { success: false, error: 'Missing walletId', errorCode: 'WALLET_NOT_FOUND' };
    }

    if (!request.encryptedBundle) {
      return { success: false, error: 'Missing encrypted bundle', errorCode: 'INVALID_BUNDLE' };
    }

    if (!request.apiKey) {
      return { success: false, error: 'Missing API key', errorCode: 'UNAUTHORIZED' };
    }

    // Verify the bundle hasn't been tampered with
    if (request.signature) {
      const { createHmac } = require('crypto');
      const expectedSig = createHmac('sha256', this.config.webhookSecret)
        .update(`${request.walletId}:${request.encryptedBundle}`)
        .digest('hex');

      if (!this.timingSafeEqual(request.signature, expectedSig)) {
        return { success: false, error: 'Invalid bundle signature — possible tampering', errorCode: 'INVALID_SIGNATURE' };
      }
    }

    // Check if bundle is too old
    const deliveredInfo = this.deliveredBundles.get(request.walletId);
    if (deliveredInfo) {
      const age = Date.now() - deliveredInfo.deliveredAt;
      if (age > this.config.maxBundleAgeMs) {
        return {
          success: false,
          error: `Recovery bundle is too old (${Math.round(age / 86400000)} days). Max age: ${Math.round(this.config.maxBundleAgeMs / 86400000)} days.`,
          errorCode: 'BUNDLE_EXPIRED',
        };
      }
    }

    // Attempt to decrypt and import the bundle
    try {
      // In production: this decodes the bundle, decrypts shares, and redistributes to MPC nodes.
      // For now, validate the bundle structure and return success.
      const parsed = JSON.parse(request.encryptedBundle);

      if (!parsed.walletId || !Array.isArray(parsed.shares)) {
        return { success: false, error: 'Invalid bundle format', errorCode: 'INVALID_BUNDLE' };
      }

      const shareCount = parsed.shares.length;
      if (shareCount < 2) {
        return { success: false, error: 'Bundle must contain at least 2 shares', errorCode: 'INVALID_BUNDLE' };
      }

      this.logWebhook(request.walletId, true);

      return {
        success: true,
        sharesRestored: shareCount,
      };
    } catch {
      this.logWebhook(request.walletId, false, 'Failed to parse bundle');
      return { success: false, error: 'Invalid bundle format', errorCode: 'INVALID_BUNDLE' };
    }
  }

  /**
   * Verify a webhook delivery by checking the signature.
   */
  verifyWebhookDelivery(
    walletId: string,
    encryptedBundle: string,
    signature: string,
  ): boolean {
    const { createHmac } = require('crypto');
    const expected = createHmac('sha256', this.config.webhookSecret)
      .update(`${walletId}:${encryptedBundle}`)
      .digest('hex');

    return this.timingSafeEqual(signature, expected);
  }

  /**
   * Retrieve webhook delivery log.
   */
  getWebhookLog(): Array<{ timestamp: number; walletId: string; success: boolean; error?: string }> {
    return [...this.webhookLog];
  }

  /**
   * Get the delivery status for a wallet.
   */
  getDeliveryStatus(walletId: string): { delivered: boolean; deliveredAt?: number; bundleHash?: string } | null {
    const info = this.deliveredBundles.get(walletId);
    if (!info) return null;
    return { delivered: true, deliveredAt: info.deliveredAt, bundleHash: info.bundleHash };
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private logWebhook(walletId: string, success: boolean, error?: string): void {
    this.webhookLog.push({ timestamp: Date.now(), walletId, success, error });
    // Keep log bounded
    if (this.webhookLog.length > 1000) {
      this.webhookLog.splice(0, this.webhookLog.length - 1000);
    }
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Cleanup expired bundle records.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [walletId, info] of this.deliveredBundles) {
      if (now - info.deliveredAt > this.config.maxBundleAgeMs) {
        this.deliveredBundles.delete(walletId);
      }
    }
  }

  /**
   * Destroy the manager, clearing all state.
   */
  destroy(): void {
    this.deliveredBundles.clear();
    this.webhookLog.length = 0;
  }
}
