/**
 * Concurrent Signing Support — per-wallet mutex + FIFO queue.
 *
 * Rules:
 *   - Different wallets can sign concurrently (no interference)
 *   - Same wallet: only ONE active signing ceremony at a time (mutex)
 *   - Additional requests for same wallet are queued (FIFO, max depth 10)
 *   - Queue full → return 429 Too Many Requests
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface ConcurrencyConfig {
  /** Max queue depth per wallet */
  maxQueueDepth: number;
  /** Default ceremony timeout (ms) */
  ceremonyTimeoutMs: number;
}

const DEFAULT_CONFIG: ConcurrencyConfig = {
  maxQueueDepth: 10,
  ceremonyTimeoutMs: 30000,
};

export type QueueEntry = {
  requestId: string;
  walletId: string;
  messageHash: string;
  chain: string;
  enqueuedAt: number;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
};

export interface ConcurrencyStats {
  activeCeremonies: number;
  queuedRequests: number;
  byWallet: Map<string, { active: boolean; queueLength: number }>;
}

// ─── Wallet Mutex ─────────────────────────────────────────────────────

class WalletMutex {
  private locked: boolean;
  private activeEntry: QueueEntry | null;
  private queue: QueueEntry[];
  private maxQueue: number;

  constructor(maxQueue: number = 10) {
    this.locked = false;
    this.activeEntry = null;
    this.queue = [];
    this.maxQueue = maxQueue;
  }

  isLocked(): boolean {
    return this.locked;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  acquire(entry: QueueEntry): boolean | null {
    if (!this.locked) {
      this.locked = true;
      this.activeEntry = entry;
      return true;
    }

    if (this.queue.length >= this.maxQueue) {
      return null;
    }

    this.queue.push(entry);
    return false;
  }

  release(): QueueEntry | null {
    this.locked = false;
    this.activeEntry = null;

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.locked = true;
      this.activeEntry = next;
      return next;
    }

    return null;
  }

  /**
   * Resolve the active entry (success path).
   */
  resolveActive(result: any): void {
    if (this.activeEntry) {
      this.activeEntry.resolve(result);
      this.activeEntry = null;
    }
  }

  /**
   * Reject both the active entry and all queued entries.
   */
  drain(error: Error): void {
    if (this.activeEntry) {
      this.activeEntry.reject(error);
      this.activeEntry = null;
    }
    while (this.queue.length > 0) {
      const entry = this.queue.shift()!;
      entry.reject(error);
    }
    this.locked = false;
  }
}

// ─── Concurrency Manager ──────────────────────────────────────────────

export class ConcurrencyManager {
  private mutexes: Map<string, WalletMutex>;
  private config: ConcurrencyConfig;
  private activeCount: number;

  constructor(config?: Partial<ConcurrencyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mutexes = new Map();
    this.activeCount = 0;
  }

  /**
   * Submit a signing request. Returns promise that resolves when the
   * signing ceremony completes (or rejects if queue full / error).
   */
  submit(
    walletId: string,
    messageHash: string,
    chain: string,
    requestId: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let mutex = this.mutexes.get(walletId);
      if (!mutex) {
        mutex = new WalletMutex(this.config.maxQueueDepth);
        this.mutexes.set(walletId, mutex);
      }

      const entry: QueueEntry = {
        requestId,
        walletId,
        messageHash,
        chain,
        enqueuedAt: Date.now(),
        resolve,
        reject,
      };

      const result = mutex.acquire(entry);

      if (result === null) {
        reject(new Error('429: Too Many Requests — queue full for this wallet'));
        return;
      }

      if (result === true) {
        this.activeCount++;
        // Caller must call complete() or fail() to release the lock
        // The resolve/reject are stored in the entry and called externally
      }
      // If result === false, the entry is queued — resolve/reject will be called later
    });
  }

  /**
   * Complete a signing ceremony for a wallet, releasing the lock.
   * Returns the next queued entry if any.
   */
  complete(walletId: string, result: any): QueueEntry | null {
    const mutex = this.mutexes.get(walletId);
    if (!mutex) {
      this.activeCount = Math.max(0, this.activeCount - 1);
      return null;
    }

    mutex.resolveActive(result);
    const next = mutex.release();

    if (!next) {
      this.activeCount = Math.max(0, this.activeCount - 1);
    }

    return next;
  }

  /**
   * Fail a signing ceremony, releasing the lock and draining the queue.
   */
  fail(walletId: string, error: Error): void {
    const mutex = this.mutexes.get(walletId);
    if (mutex) {
      mutex.drain(error);
    }
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  /**
   * Check if a wallet is currently signing.
   */
  isSigning(walletId: string): boolean {
    const mutex = this.mutexes.get(walletId);
    return mutex?.isLocked() ?? false;
  }

  /**
   * Get queue length for a wallet.
   */
  getQueueLength(walletId: string): number {
    return this.mutexes.get(walletId)?.getQueueLength() ?? 0;
  }

  /**
   * Get concurrency statistics.
   */
  getStats(): ConcurrencyStats {
    const byWallet = new Map<string, { active: boolean; queueLength: number }>();

    for (const [walletId, mutex] of this.mutexes) {
      byWallet.set(walletId, {
        active: mutex.isLocked(),
        queueLength: mutex.getQueueLength(),
      });
    }

    let queuedRequests = 0;
    for (const [, s] of byWallet) {
      queuedRequests += s.queueLength;
    }

    return {
      activeCeremonies: this.activeCount,
      queuedRequests,
      byWallet,
    };
  }

  /**
   * Clean up inactive wallets.
   */
  cleanup(): void {
    for (const [walletId, mutex] of this.mutexes) {
      if (!mutex.isLocked() && mutex.getQueueLength() === 0) {
        this.mutexes.delete(walletId);
      }
    }
  }

  /**
   * Destroy the concurrency manager.
   */
  destroy(): void {
    const error = new Error('Concurrency manager destroyed');
    for (const [, mutex] of this.mutexes) {
      mutex.drain(error);
    }
    this.mutexes.clear();
    this.activeCount = 0;
  }
}
