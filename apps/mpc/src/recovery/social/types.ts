/**
 * Social Recovery Types — guardians, approvals, time-locks.
 */

export interface Guardian {
  /** Unique guardian ID */
  id: string;
  /** Display name or label */
  name: string;
  /** Contact method for sending approval requests */
  contact: string;
  /** Contact type: email or wallet address */
  contactType: 'email' | 'wallet';
  /** Ed25519 public key for verifying guardian signatures (wallet type) */
  publicKey?: string;
}

export interface SocialRecoveryConfig {
  /** Wallet ID being recovered */
  walletId: string;
  /** List of designated guardians */
  guardians: Guardian[];
  /** Required number of guardian approvals (M-of-N) */
  threshold: number;
  /** Time-lock delay in ms before recovery executes (default 48h) */
  timeLockMs: number;
  /** Whether the user can cancel a pending recovery */
  cancelable: boolean;
}

export const DEFAULT_SOCIAL_CONFIG: Partial<SocialRecoveryConfig> = {
  timeLockMs: 48 * 60 * 60 * 1000, // 48 hours
  cancelable: true,
};

export interface RecoveryRequest {
  /** Unique request ID */
  id: string;
  /** Wallet ID */
  walletId: string;
  /** Recovery status */
  status: RecoveryRequestStatus;
  /** Required guardian approvals count */
  requiredApprovals: number;
  /** Approved guardian IDs */
  approvedBy: string[];
  /** Guardian IDs yet to approve */
  pendingGuardians: string[];
  /** Timestamp when all approvals met (or null if not yet met) */
  allApprovedAt: number | null;
  /** Earliest timestamp recovery can execute (approvals + time-lock) */
  executeAfter: number | null;
  /** When the request was created */
  createdAt: number;
  /** When the request expires (configurable, default 7 days) */
  expiresAt: number;
  /** Reason if cancelled or rejected */
  cancelReason?: string;
}

export type RecoveryRequestStatus =
  | 'pending'
  | 'collecting_approvals'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'rejected';

export interface GuardianApproval {
  /** Guardian ID */
  guardianId: string;
  /** Recovery request ID */
  requestId: string;
  /** Timestamp of approval */
  approvedAt: number;
  /** Cryptographically signed approval (for wallet-type guardians) */
  signature?: string;
  /** Method of approval */
  method: 'email_link' | 'wallet_signature' | 'manual';
}

export interface RecoveryNotification {
  /** Unique notification ID */
  id: string;
  /** Recovery request ID */
  requestId: string;
  /** Target guardian ID */
  guardianId: string;
  /** Notification type */
  type: 'approval_request' | 'time_lock_warning' | 'recovery_started' | 'recovery_completed' | 'recovery_cancelled';
  /** Template variables for rendering the notification */
  data: Record<string, string>;
  /** Whether notification was sent */
  sent: boolean;
  /** When the notification was created */
  createdAt: number;
  /** When it was sent (null if pending) */
  sentAt: number | null;
}

export interface SocialRecoveryResult {
  /** Whether recovery succeeded */
  success: boolean;
  /** Recovered shares (if successful) */
  shares?: Map<number, { partyIndex: number; share: bigint; publicKey: Uint8Array }>;
  /** Error message if failed */
  error?: string;
  /** List of guardians who approved */
  approvedBy?: string[];
  /** Duration of the entire recovery process (ms) */
  durationMs: number;
}
