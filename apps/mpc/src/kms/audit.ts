/**
 * Audit Logger — records every KMS key access for security monitoring.
 *
 * In production, audit logs are shipped to:
 *   - CloudWatch Logs (AWS)
 *   - Cloud Logging (GCP)
 *   - SIEM (Splunk / Datadog)
 *
 * In development, audit logs are written to stdout.
 */

import type { AuditAction, AuditLogEntry, KmsProviderType } from './types';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';

export class AuditLogger extends EventEmitter {
  private entries: AuditLogEntry[];
  private maxEntries: number;
  private enabled: boolean;

  constructor(maxEntries: number = 10000) {
    super();
    this.entries = [];
    this.maxEntries = maxEntries;
    this.enabled = true;
  }

  /**
   * Log an audit event.
   */
  log(
    action: AuditAction,
    provider: KmsProviderType,
    keyId: string,
    details: {
      success: boolean;
      context?: string;
      principal?: string;
      source?: string;
      error?: string;
      durationMs?: number;
    },
  ): AuditLogEntry {
    if (!this.enabled) {
      return this.createStubEntry();
    }

    const entry: AuditLogEntry = {
      id: randomBytes(16).toString('hex'),
      timestamp: Date.now(),
      action,
      provider,
      keyId,
      context: details.context,
      principal: details.principal ?? process.env.USER ?? 'unknown',
      source: details.source ?? 'localhost',
      success: details.success,
      error: details.error,
      durationMs: details.durationMs,
    };

    this.entries.push(entry);

    // Evict old entries if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Emit for real-time consumers (Sentry, Datadog, etc.)
    this.emit('audit', entry);

    // Write to stdout for log aggregation
    if (!details.success) {
      console.warn(`[KMS AUDIT] ${action.toUpperCase()} ${details.success ? 'OK' : 'FAIL'} | ${provider} | ${keyId} | ${details.error ?? ''}`);
    }

    return entry;
  }

  /**
   * Get recent audit entries.
   */
  getEntries(limit?: number): AuditLogEntry[] {
    return limit ? this.entries.slice(-limit) : [...this.entries];
  }

  /**
   * Get entries for a specific key.
   */
  getEntriesByKey(keyId: string): AuditLogEntry[] {
    return this.entries.filter((e) => e.keyId === keyId);
  }

  /**
   * Count entries by action type.
   */
  countByAction(): Record<AuditAction, number> {
    const counts: Record<string, number> = {};
    for (const entry of this.entries) {
      counts[entry.action] = (counts[entry.action] ?? 0) + 1;
    }
    return counts as Record<AuditAction, number>;
  }

  /**
   * Enable audit logging.
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable audit logging.
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Clear all audit entries.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Export entries as JSON (for compliance / archiving).
   */
  export(): AuditLogEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  private createStubEntry(): AuditLogEntry {
    return {
      id: 'disabled',
      timestamp: Date.now(),
      action: 'encrypt',
      provider: 'local',
      keyId: 'disabled',
      success: true,
    };
  }
}

/** Shared singleton for app-wide audit logging */
let defaultLogger: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!defaultLogger) {
    defaultLogger = new AuditLogger();
  }
  return defaultLogger;
}

export function setAuditLogger(logger: AuditLogger): void {
  defaultLogger = logger;
}
