/**
 * Reconnection — exponential backoff with jitter.
 *
 * Default backoff: 1s → 2s → 4s → 8s → ... → 30s (capped)
 * Jitter: ±10% random to avoid thundering herd.
 */

import type { ReconnectConfig } from './types';
import { DEFAULT_RECONNECT_CONFIG } from './types';

export type ReconnectEvent = 'attempt' | 'connected' | 'failed' | 'max_attempts';

export type ReconnectCallback = (
  event: ReconnectEvent,
  partyId: number,
  details: { attempt: number; delayMs: number; totalElapsed: number },
) => void;

export class ReconnectionManager {
  private config: ReconnectConfig;
  private timers: Map<number, ReturnType<typeof setTimeout>>;
  private attempts: Map<number, number>;
  private startTimes: Map<number, number>;
  private onEvent: ReconnectCallback | null;

  constructor(config?: Partial<ReconnectConfig>) {
    this.config = { ...DEFAULT_RECONNECT_CONFIG, ...config };
    this.timers = new Map();
    this.attempts = new Map();
    this.startTimes = new Map();
    this.onEvent = null;
  }

  setCallback(cb: ReconnectCallback): void {
    this.onEvent = cb;
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Returns the delay in ms until the next attempt.
   */
  schedule(partyId: number, connectFn: () => Promise<void>): number {
    this.cancel(partyId);

    const attempt = (this.attempts.get(partyId) ?? 0) + 1;
    this.attempts.set(partyId, attempt);

    if (!this.startTimes.has(partyId)) {
      this.startTimes.set(partyId, Date.now());
    }

    const delay = this.computeDelay(attempt);
    const totalElapsed = Date.now() - (this.startTimes.get(partyId) ?? Date.now());

    // Check max total time
    if (this.config.maxTotalMs > 0 && totalElapsed > this.config.maxTotalMs) {
      this.emit('max_attempts', partyId, { attempt, delayMs: delay, totalElapsed });
      return delay;
    }

    this.emit('attempt', partyId, { attempt, delayMs: delay, totalElapsed });

    const timer = setTimeout(async () => {
      try {
        await connectFn();
        this.attempts.set(partyId, 0);
        this.startTimes.delete(partyId);
        this.emit('connected', partyId, { attempt, delayMs: delay, totalElapsed: Date.now() - (this.startTimes.get(partyId) ?? Date.now()) });
      } catch {
        this.emit('failed', partyId, { attempt, delayMs: delay, totalElapsed: Date.now() - (this.startTimes.get(partyId) ?? Date.now()) });
        this.schedule(partyId, connectFn);
      }
    }, delay);

    this.timers.set(partyId, timer);
    return delay;
  }

  /**
   * Compute backoff delay with jitter.
   */
  computeDelay(attempt: number): number {
    const base = this.config.initialDelayMs * Math.pow(this.config.factor, attempt - 1);
    const capped = Math.min(base, this.config.maxDelayMs);
    const jitter = capped * this.config.jitter * (Math.random() * 2 - 1); // ±10%
    return Math.round(capped + jitter);
  }

  /**
   * Cancel pending reconnection for a party.
   */
  cancel(partyId: number): void {
    const timer = this.timers.get(partyId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(partyId);
    }
  }

  /**
   * Reset reconnection state (call on successful connection).
   */
  reset(partyId: number): void {
    this.cancel(partyId);
    this.attempts.set(partyId, 0);
    this.startTimes.delete(partyId);
  }

  /**
   * Get current attempt count.
   */
  getAttempts(partyId: number): number {
    return this.attempts.get(partyId) ?? 0;
  }

  /**
   * Clean up all timers.
   */
  destroy(): void {
    for (const [, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.attempts.clear();
    this.startTimes.clear();
  }

  private emit(
    event: ReconnectEvent,
    partyId: number,
    details: { attempt: number; delayMs: number; totalElapsed: number },
  ): void {
    if (this.onEvent) {
      try {
        this.onEvent(event, partyId, details);
      } catch {
        // callback errors should not break reconnection loop
      }
    }
  }
}
