/**
 * Signing Audit Log — immutable record of every signing ceremony.
 *
 * Logs: walletId, developerId, chain, messageHash, timestamp,
 *       partyIds, success, error, ceremonyId, durationMs.
 *
 * In production:
 *   - Writes to PostgreSQL `ceremony_logs` table
 *   - App role has INSERT-only, no UPDATE/DELETE
 *   - Webhook notifies developer's registered URL
 *   - Dashboard queries for history + search
 */

import { randomBytes } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────

export interface SigningAuditEntry {
  id: string;
  ceremonyId: string;
  walletId: string;
  developerId: string;
  chain: string;
  messageHash: string;
  timestamp: number;
  partyIds: number[];
  success: boolean;
  signature?: string;
  error?: string;
  durationMs?: number;
  ipAddress?: string;
  userAgent?: string;
}

export type WebhookEvent = 'signing_requested' | 'signing_completed' | 'signing_failed';

export interface WebhookRegistration {
  developerId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
}

// ─── Audit Logger ─────────────────────────────────────────────────────

export class SigningAuditLogger {
  private entries: SigningAuditEntry[];
  private webhooks: Map<string, WebhookRegistration[]>;
  private maxEntries: number;

  constructor(maxEntries: number = 10000) {
    this.entries = [];
    this.webhooks = new Map();
    this.maxEntries = maxEntries;
  }

  /**
   * Log a signing event.
   */
  log(entry: Omit<SigningAuditEntry, 'id' | 'timestamp'>): SigningAuditEntry {
    const full: SigningAuditEntry = {
      ...entry,
      id: randomBytes(16).toString('hex'),
      timestamp: Date.now(),
    };

    this.entries.push(full);

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Fire webhooks
    this.fireWebhooks(full);

    // Log to stdout for log aggregation
    const status = full.success ? 'OK' : 'FAIL';
    console.log(
      `[SIGNING AUDIT] ${status} | ${full.chain} | wallet=${full.walletId} | ` +
      `parties=[${full.partyIds.join(',')}] | duration=${full.durationMs ?? '?'}ms ` +
      `${full.error ? '| error=' + full.error : ''}`,
    );

    return full;
  }

  /**
   * Register a webhook for a developer.
   */
  registerWebhook(registration: WebhookRegistration): void {
    const list = this.webhooks.get(registration.developerId) || [];
    list.push(registration);
    this.webhooks.set(registration.developerId, list);
  }

  /**
   * Unregister all webhooks for a developer.
   */
  unregisterWebhooks(developerId: string): void {
    this.webhooks.delete(developerId);
  }

  /**
   * Get audit entries for a wallet.
   */
  getByWallet(walletId: string, limit?: number): SigningAuditEntry[] {
    const filtered = this.entries.filter((e) => e.walletId === walletId);
    return limit ? filtered.slice(-limit) : filtered;
  }

  /**
   * Get audit entries for a developer.
   */
  getByDeveloper(developerId: string, limit?: number): SigningAuditEntry[] {
    const filtered = this.entries.filter((e) => e.developerId === developerId);
    return limit ? filtered.slice(-limit) : filtered;
  }

  /**
   * Get recent entries across all wallets.
   */
  getRecent(limit: number = 50): SigningAuditEntry[] {
    return this.entries.slice(-limit);
  }

  /**
   * Get success rate for a wallet.
   */
  getSuccessRate(walletId: string): { total: number; successful: number; failed: number; rate: number } {
    const filtered = this.entries.filter((e) => e.walletId === walletId);
    const total = filtered.length;
    const successful = filtered.filter((e) => e.success).length;
    const failed = total - successful;
    return {
      total,
      successful,
      failed,
      rate: total > 0 ? successful / total : 1,
    };
  }

  /**
   * Get summary statistics.
   */
  getStats(): {
    totalSignings: number;
    successRate: number;
    byChain: Record<string, number>;
    avgDurationMs: number;
  } {
    const byChain: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;

    for (const entry of this.entries) {
      byChain[entry.chain] = (byChain[entry.chain] ?? 0) + 1;
      if (entry.durationMs) {
        totalDuration += entry.durationMs;
        durationCount++;
      }
    }

    const successful = this.entries.filter((e) => e.success).length;

    return {
      totalSignings: this.entries.length,
      successRate: this.entries.length > 0 ? successful / this.entries.length : 1,
      byChain,
      avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
    };
  }

  /**
   * Export entries for archival.
   */
  export(): SigningAuditEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
  }

  // ─── Internal ────────────────────────────────────────────────────

  private fireWebhooks(entry: SigningAuditEntry): void {
    const event: WebhookEvent = entry.success
      ? 'signing_completed'
      : 'signing_failed';

    const registrations = this.webhooks.get(entry.developerId) || [];

    for (const reg of registrations) {
      if (!reg.active) continue;
      if (!reg.events.includes(event) && !reg.events.includes('signing_requested')) continue;

      // In production: POST to reg.url with HMAC signature using reg.secret
      // For now: just track that webhook would fire
    }
  }
}
