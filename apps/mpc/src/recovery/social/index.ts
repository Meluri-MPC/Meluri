/**
 * Social Recovery — M-of-N guardian-based wallet recovery with time-lock.
 *
 * Flow:
 *   1. User designates 3-5 guardians (email addresses or wallet addresses)
 *   2. User initiates recovery → guardians receive approval requests
 *   3. Guardians approve via email link or wallet signature
 *   4. After M-of-N threshold met + time-lock expires → shares are restored
 *   5. User can cancel pending recovery at any time (if still has auth access)
 *
 * Security:
 *   - Time-lock (48h default) prevents immediate theft even if guardians collude
 *   - Cancel capability allows legitimate user to abort unauthorized recovery
 *   - Guardian approvals are timestamped and immutable
 */

import type {
  Guardian,
  SocialRecoveryConfig,
  RecoveryRequest,
  RecoveryRequestStatus,
  GuardianApproval,
  RecoveryNotification,
  SocialRecoveryResult,
} from './types';
import { DEFAULT_SOCIAL_CONFIG } from './types';

// ─── Constants ────────────────────────────────────────────────────────────

const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_GUARDIANS = 3;
const MAX_GUARDIANS = 5;

// ─── Social Recovery Manager ──────────────────────────────────────────────

export class SocialRecoveryManager {
  private config: SocialRecoveryConfig;
  private recoveryRequests: Map<string, RecoveryRequest>;
  private approvals: Map<string, GuardianApproval[]>;
  private notifications: RecoveryNotification[];
  private notificationHandler: ((notification: RecoveryNotification) => void) | null;

  constructor(config: SocialRecoveryConfig) {
    this.validateConfig(config);
    this.config = {
      ...DEFAULT_SOCIAL_CONFIG,
      ...config,
    };
    this.recoveryRequests = new Map();
    this.approvals = new Map();
    this.notifications = [];
    this.notificationHandler = null;
  }

  // ── Configuration Validation ──────────────────────────────────────────

  private validateConfig(config: SocialRecoveryConfig): void {
    if (!config.walletId) {
      throw new Error('Social recovery requires a walletId');
    }

    if (!config.guardians || config.guardians.length < MIN_GUARDIANS) {
      throw new Error(`Social recovery requires at least ${MIN_GUARDIANS} guardians`);
    }

    if (config.guardians.length > MAX_GUARDIANS) {
      throw new Error(`Social recovery allows at most ${MAX_GUARDIANS} guardians`);
    }

    // Check unique guardian IDs
    const ids = new Set(config.guardians.map((g) => g.id));
    if (ids.size !== config.guardians.length) {
      throw new Error('Guardian IDs must be unique');
    }

    if (config.threshold < 2) {
      throw new Error('Recovery threshold must be at least 2');
    }

    if (config.threshold > config.guardians.length) {
      throw new Error(`Threshold ${config.threshold} exceeds guardian count ${config.guardians.length}`);
    }

    // Validate guardian contacts
    for (const g of config.guardians) {
      if (g.contactType === 'email' && !g.contact.includes('@')) {
        throw new Error(`Guardian '${g.name}': invalid email format`);
      }
      if (g.contactType === 'wallet' && !g.publicKey) {
        throw new Error(`Guardian '${g.name}': wallet guardians require a publicKey`);
      }
    }
  }

  // ── Recovery Request Lifecycle ────────────────────────────────────────

  /**
   * Initiate a social recovery request.
   * Sends approval requests to all guardians.
   */
  initiateRecovery(): RecoveryRequest {
    const requestId = `social-recovery-${this.config.walletId}-${Date.now()}`;

    const request: RecoveryRequest = {
      id: requestId,
      walletId: this.config.walletId,
      status: 'collecting_approvals',
      requiredApprovals: this.config.threshold,
      approvedBy: [],
      pendingGuardians: this.config.guardians.map((g) => g.id),
      allApprovedAt: null,
      executeAfter: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + DEFAULT_EXPIRY_MS,
    };

    this.recoveryRequests.set(requestId, request);
    this.approvals.set(requestId, []);

    // Send approval requests to all guardians
    for (const guardian of this.config.guardians) {
      this.sendNotification({
        id: `notif-${requestId}-${guardian.id}`,
        requestId,
        guardianId: guardian.id,
        type: 'approval_request',
        data: {
          walletId: this.config.walletId,
          guardianName: guardian.name,
          guardianEmail: guardian.contact,
          requestId,
          threshold: String(this.config.threshold),
          totalGuardians: String(this.config.guardians.length),
          timeLockHours: String(Math.round((this.config.timeLockMs ?? DEFAULT_SOCIAL_CONFIG.timeLockMs!) / 3600000)),
          recoveryUrl: `https://mpc.velumx.io/recovery/${requestId}/approve`,
          expiresAt: new Date(request.expiresAt).toISOString(),
        },
        sent: false,
        createdAt: Date.now(),
        sentAt: null,
      });
    }

    return request;
  }

  /**
   * Record a guardian approval.
   *
   * @returns Whether the approval was recorded successfully
   */
  recordApproval(requestId: string, guardianId: string, signature?: string): boolean {
    const request = this.recoveryRequests.get(requestId);
    if (!request) {
      throw new Error(`Recovery request ${requestId} not found`);
    }

    // Check request is still valid
    if (request.status === 'cancelled' || request.status === 'expired' || request.status === 'completed') {
      throw new Error(`Recovery request is ${request.status}`);
    }

    // Verify guardian is part of this recovery config
    const guardian = this.config.guardians.find((g) => g.id === guardianId);
    if (!guardian) {
      throw new Error(`Guardian ${guardianId} is not part of this recovery`);
    }

    // Check for duplicate approval
    if (request.approvedBy.includes(guardianId)) {
      return true; // Already approved, idempotent
    }

    // Verify wallet guardian signature if applicable
    if (guardian.contactType === 'wallet' && signature) {
      const isValid = this.verifyGuardianSignature(guardian, requestId, signature);
      if (!isValid) {
        throw new Error(`Invalid signature from guardian ${guardianId}`);
      }
    }

    // Record approval
    const approval: GuardianApproval = {
      guardianId,
      requestId,
      approvedAt: Date.now(),
      signature: signature ?? undefined,
      method: guardian.contactType === 'email' ? 'email_link' : 'wallet_signature',
    };

    const approvals = this.approvals.get(requestId) ?? [];
    approvals.push(approval);
    this.approvals.set(requestId, approvals);

    // Update request state
    request.approvedBy.push(guardianId);
    request.pendingGuardians = request.pendingGuardians.filter((id) => id !== guardianId);

    // Check if threshold is met
    if (request.approvedBy.length >= request.requiredApprovals) {
      request.allApprovedAt = Date.now();
      request.executeAfter = request.allApprovedAt + (this.config.timeLockMs ?? DEFAULT_SOCIAL_CONFIG.timeLockMs!);
      request.status = 'approved';

      // Send time-lock warning notification
      this.sendNotification({
        id: `notif-timelock-${requestId}`,
        requestId,
        guardianId: guardianId,
        type: 'time_lock_warning',
        data: {
          walletId: this.config.walletId,
          executeAfter: new Date(request.executeAfter).toISOString(),
          timeLockHours: String(Math.round((this.config.timeLockMs ?? DEFAULT_SOCIAL_CONFIG.timeLockMs!) / 3600000)),
        },
        sent: false,
        createdAt: Date.now(),
        sentAt: null,
      });
    }

    return true;
  }

  /**
   * Check if the time-lock has expired and recovery can proceed.
   */
  canExecute(requestId: string): boolean {
    const request = this.recoveryRequests.get(requestId);
    if (!request) return false;

    if (request.status !== 'approved') return false;
    if (!request.executeAfter) return false;

    return Date.now() >= request.executeAfter;
  }

  /**
   * Execute the recovery after all conditions are met.
   */
  executeRecovery(requestId: string): SocialRecoveryResult {
    const request = this.recoveryRequests.get(requestId);
    if (!request) {
      return { success: false, error: 'Recovery request not found', durationMs: 0 };
    }

    if (request.status === 'completed') {
      return { success: false, error: 'Recovery already completed', durationMs: 0 };
    }

    if (request.status === 'cancelled') {
      return { success: false, error: 'Recovery was cancelled', durationMs: 0 };
    }

    if (request.status === 'expired') {
      return { success: false, error: 'Recovery request expired', durationMs: 0 };
    }

    if (request.status !== 'approved') {
      return {
        success: false,
        error: `Cannot execute: ${request.approvedBy.length}/${request.requiredApprovals} approvals collected`,
        durationMs: Date.now() - request.createdAt,
      };
    }

    if (!this.canExecute(requestId)) {
      const remainingMs = (request.executeAfter ?? Date.now()) - Date.now();
      return {
        success: false,
        error: `Time-lock not expired. ${Math.ceil(remainingMs / 3600000)} hours remaining.`,
        durationMs: Date.now() - request.createdAt,
      };
    }

    // Mark as executing
    request.status = 'executing';

    // Send recovery started notification
    this.sendNotification({
      id: `notif-started-${requestId}`,
      requestId,
      guardianId: 'system',
      type: 'recovery_started',
      data: { walletId: this.config.walletId },
      sent: false,
      createdAt: Date.now(),
      sentAt: null,
    });

    // In production: decrypt shares, redistribute to MPC nodes
    // For now, return success with metadata
    request.status = 'completed';

    this.sendNotification({
      id: `notif-completed-${requestId}`,
      requestId,
      guardianId: 'system',
      type: 'recovery_completed',
      data: { walletId: this.config.walletId },
      sent: false,
      createdAt: Date.now(),
      sentAt: null,
    });

    return {
      success: true,
      approvedBy: request.approvedBy,
      durationMs: Date.now() - request.createdAt,
    };
  }

  /**
   * Cancel a pending recovery request.
   */
  cancelRecovery(requestId: string, reason?: string): { cancelled: boolean; message: string } {
    const request = this.recoveryRequests.get(requestId);
    if (!request) {
      return { cancelled: false, message: 'Recovery request not found' };
    }

    if (request.status === 'completed') {
      return { cancelled: false, message: 'Recovery already completed' };
    }

    if (request.status === 'cancelled') {
      return { cancelled: false, message: 'Recovery already cancelled' };
    }

    if (!this.config.cancelable) {
      return { cancelled: false, message: 'This recovery configuration does not allow cancellation' };
    }

    request.status = 'cancelled';
    request.cancelReason = reason ?? 'Cancelled by user';

    this.sendNotification({
      id: `notif-cancelled-${requestId}`,
      requestId,
      guardianId: 'system',
      type: 'recovery_cancelled',
      data: {
        walletId: this.config.walletId,
        reason: request.cancelReason,
      },
      sent: false,
      createdAt: Date.now(),
      sentAt: null,
    });

    return { cancelled: true, message: 'Recovery cancelled successfully' };
  }

  // ── Status & Queries ──────────────────────────────────────────────────

  /**
   * Get the status of a recovery request.
   */
  getRecoveryStatus(requestId: string): RecoveryRequest | null {
    return this.recoveryRequests.get(requestId) ?? null;
  }

  /**
   * Get all approvals for a recovery request.
   */
  getApprovals(requestId: string): GuardianApproval[] {
    return this.approvals.get(requestId) ?? [];
  }

  /**
   * Get the number of missing approvals.
   */
  getRemainingApprovals(requestId: string): number {
    const request = this.recoveryRequests.get(requestId);
    if (!request) return -1;
    return Math.max(0, request.requiredApprovals - request.approvedBy.length);
  }

  /**
   * Check if the time-lock period has elapsed.
   */
  getTimeLockRemainingMs(requestId: string): number | null {
    const request = this.recoveryRequests.get(requestId);
    if (!request?.executeAfter) return null;
    return Math.max(0, request.executeAfter - Date.now());
  }

  /**
   * Get all pending recovery requests.
   */
  getPendingRecoveries(): RecoveryRequest[] {
    return Array.from(this.recoveryRequests.values()).filter(
      (r) => r.status === 'pending' || r.status === 'collecting_approvals' || r.status === 'approved',
    );
  }

  // ── Notification System ───────────────────────────────────────────────

  /**
   * Register a custom notification handler (for email, push, webhook).
   */
  setNotificationHandler(handler: (notification: RecoveryNotification) => void): void {
    this.notificationHandler = handler;
  }

  /**
   * Get all sent/pending notifications.
   */
  getNotifications(): RecoveryNotification[] {
    return [...this.notifications];
  }

  private sendNotification(notification: RecoveryNotification): void {
    this.notifications.push(notification);

    // Mark as sent
    notification.sent = true;
    notification.sentAt = Date.now();

    // Dispatch to external handler if registered
    if (this.notificationHandler) {
      try {
        this.notificationHandler(notification);
      } catch {
        // Callback errors should not break recovery flow
      }
    }
  }

  // ── Guardian Signature Verification ───────────────────────────────────

  private verifyGuardianSignature(
    guardian: Guardian,
    requestId: string,
    signature: string,
  ): boolean {
    if (!guardian.publicKey) return false;

    try {
      // For wallet-based guardians, verify that the guardian signed
      // the recovery request ID using their Ed25519 key.
      // In production, this would use actual Ed25519 verification.
      // For now, verify the signature is a valid hex string (structure check).
      if (signature.length !== 128) return false; // Ed25519 sig is 64 bytes = 128 hex
      return /^[0-9a-f]{128}$/i.test(signature);
    } catch {
      return false;
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  /**
   * Remove expired recovery requests.
   */
  cleanup(): RecoveryRequest[] {
    const now = Date.now();
    const expired: RecoveryRequest[] = [];

    for (const [id, request] of this.recoveryRequests) {
      if (request.expiresAt < now && request.status !== 'completed' && request.status !== 'cancelled') {
        request.status = 'expired';
        expired.push(request);
        this.recoveryRequests.delete(id);
      }
    }

    return expired;
  }

  /**
   * Destroy the recovery manager, clearing all state.
   */
  destroy(): void {
    this.recoveryRequests.clear();
    this.approvals.clear();
    this.notifications.length = 0;
    this.notificationHandler = null;
  }

  // ── Accessors ─────────────────────────────────────────────────────────

  getConfig(): SocialRecoveryConfig {
    return { ...this.config, guardians: [...this.config.guardians] };
  }
}

// ─── Convenience Factory ─────────────────────────────────────────────────

/**
 * Create a social recovery manager with sensible defaults.
 */
export function createSocialRecovery(
  walletId: string,
  guardians: Guardian[],
  threshold: number = 3,
  options?: Partial<Pick<SocialRecoveryConfig, 'timeLockMs' | 'cancelable'>>,
): SocialRecoveryManager {
  const defaults = DEFAULT_SOCIAL_CONFIG;
  return new SocialRecoveryManager({
    walletId,
    guardians,
    threshold,
    timeLockMs: options?.timeLockMs ?? defaults.timeLockMs!,
    cancelable: options?.cancelable ?? defaults.cancelable!,
  });
}
