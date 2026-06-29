/**
 * Signing Ceremony Coordinator — party selection, timeout, failover.
 *
 * Flow:
 *   1. Receive signing request
 *   2. Select 2-of-3 available parties (health + load aware)
 *   3. Initiate signing ceremony via WebSocket to selected parties
 *   4. If a party fails → fallback to 3rd party (restart ceremony)
 *   5. Timeout after 30s → return error
 */

import { PartySelector } from '../../topology/selector';
import { ConnectionHealth } from '../../transport/health';
import type { NodeHealth, SelectionResult } from '../../topology/types';

// ─── Types ────────────────────────────────────────────────────────────

export type CeremonyStatus =
  | 'selecting'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'fallback';

export interface CeremonyState {
  ceremonyId: string;
  walletId: string;
  messageHash: string;
  chain: string;
  status: CeremonyStatus;
  selectedParties: number[];
  fallbackParty: number | null;
  startedAt: number;
  lastActivity: number;
  timeoutMs: number;
  attempts: number;
  maxAttempts: number;
  error?: string;
}

export interface CoordinatorConfig {
  defaultTimeoutMs: number;
  maxAttempts: number;
  maxFallbackAttempts: number;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  defaultTimeoutMs: 30000,
  maxAttempts: 1,
  maxFallbackAttempts: 1,
};

// ─── Coordinator ──────────────────────────────────────────────────────

export class SigningCoordinator {
  private selector: PartySelector;
  private health: ConnectionHealth;
  private config: CoordinatorConfig;
  private activeCeremonies: Map<string, CeremonyState>;

  constructor(options?: {
    selector?: PartySelector;
    health?: ConnectionHealth;
    config?: Partial<CoordinatorConfig>;
  }) {
    this.selector = options?.selector ?? new PartySelector();
    this.health = options?.health ?? new ConnectionHealth();
    this.config = { ...DEFAULT_CONFIG, ...(options?.config ?? {}) };
    this.activeCeremonies = new Map();
  }

  /**
   * Select 2 healthy parties for a signing ceremony from the available pool.
   */
  selectParties(walletId: string, coordinatorPartyId?: number): SelectionResult {
    // Use the party selector with health data
    if (coordinatorPartyId) {
      return this.selector.selectWithCoordinator(coordinatorPartyId);
    }
    return this.selector.select(2);
  }

  /**
   * Start a new signing ceremony.
   */
  startCeremony(
    walletId: string,
    messageHash: string,
    chain: string,
    selectedParties: number[],
    fallbackParty: number | null,
  ): CeremonyState {
    const ceremonyId = `ceremony-${walletId}-${Date.now()}`;
    const state: CeremonyState = {
      ceremonyId,
      walletId,
      messageHash,
      chain,
      status: 'in_progress',
      selectedParties,
      fallbackParty,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      timeoutMs: this.config.defaultTimeoutMs,
      attempts: 1,
      maxAttempts: this.config.maxAttempts + this.config.maxFallbackAttempts,
    };

    this.activeCeremonies.set(ceremonyId, state);
    return state;
  }

  /**
   * Record activity on a ceremony (keeps it alive).
   */
  touchCeremony(ceremonyId: string): void {
    const state = this.activeCeremonies.get(ceremonyId);
    if (state) {
      state.lastActivity = Date.now();
    }
  }

  /**
   * Check if a ceremony has timed out.
   */
  isTimedOut(ceremonyId: string): boolean {
    const state = this.activeCeremonies.get(ceremonyId);
    if (!state) return true;
    return Date.now() - state.lastActivity > state.timeoutMs;
  }

  /**
   * Handle a party failure — attempt fallback to the 3rd party.
   */
  attemptFallback(ceremonyId: string, failedPartyId: number): {
    success: boolean;
    newParties?: number[];
    error?: string;
  } {
    const state = this.activeCeremonies.get(ceremonyId);
    if (!state) return { success: false, error: 'Ceremony not found' };

    if (state.attempts >= state.maxAttempts) {
      state.status = 'failed';
      state.error = 'Max attempts exceeded';
      return { success: false, error: 'Max attempts exceeded' };
    }

    if (!state.fallbackParty) {
      state.status = 'failed';
      state.error = 'No fallback party available';
      return { success: false, error: 'No fallback party available' };
    }

    // Check if fallback is healthy
    if (!this.health.isHealthy(state.fallbackParty)) {
      state.status = 'failed';
      state.error = `Fallback party ${state.fallbackParty} is unhealthy`;
      return { success: false, error: state.error };
    }

    // Replace failed party with fallback
    const newParties = state.selectedParties
      .filter((p) => p !== failedPartyId)
      .concat(state.fallbackParty);

    state.selectedParties = newParties;
    state.fallbackParty = failedPartyId; // Old failed party becomes new fallback
    state.status = 'fallback';
    state.attempts++;
    state.lastActivity = Date.now();

    return { success: true, newParties };
  }

  /**
   * Complete a ceremony successfully.
   */
  completeCeremony(ceremonyId: string, signature: string): void {
    const state = this.activeCeremonies.get(ceremonyId);
    if (state) {
      state.status = 'completed';
    }
  }

  /**
   * Fail a ceremony with an error.
   */
  failCeremony(ceremonyId: string, error: string): void {
    const state = this.activeCeremonies.get(ceremonyId);
    if (state) {
      state.status = 'failed';
      state.error = error;
    }
  }

  /**
   * Check for timed-out ceremonies.
   */
  cleanupTimeouts(): CeremonyState[] {
    const timedOut: CeremonyState[] = [];
    for (const [id, state] of this.activeCeremonies) {
      if (this.isTimedOut(id)) {
        state.status = 'timed_out';
        state.error = `Ceremony timed out after ${state.timeoutMs}ms`;
        timedOut.push(state);
        this.activeCeremonies.delete(id);
      }
    }
    return timedOut;
  }

  /**
   * Get active ceremony count.
   */
  getActiveCount(): number {
    return this.activeCeremonies.size;
  }

  /**
   * Get ceremony state.
   */
  getCeremony(ceremonyId: string): CeremonyState | undefined {
    return this.activeCeremonies.get(ceremonyId);
  }

  /**
   * Clean up completed/failed ceremonies.
   */
  cleanup(): void {
    for (const [id, state] of this.activeCeremonies) {
      if (state.status === 'completed' || state.status === 'failed' || state.status === 'timed_out') {
        this.activeCeremonies.delete(id);
      }
    }
  }

  /**
   * Destroy the coordinator.
   */
  destroy(): void {
    this.activeCeremonies.clear();
  }

  getHealth(): ConnectionHealth {
    return this.health;
  }

  getSelector(): PartySelector {
    return this.selector;
  }
}
