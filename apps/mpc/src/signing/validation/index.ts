/**
 * Signing Request Validation — auth, rate limiting, idempotency.
 */

import { getChainConfig } from '../../chains/registry';
import type { ChainId } from '../../chains/types';

// ─── Types ────────────────────────────────────────────────────────────

export interface SigningRequest {
  walletId: string;
  message: Uint8Array | string;
  chain: string;
  apiKey?: string;
  developerId?: string;
  idempotencyKey?: string;
  tenantId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  normalizedChain?: ChainId;
}

export interface RateLimitEntry {
  walletId: string;
  count: number;
  windowStart: number;
}

export interface IdempotencyEntry {
  key: string;
  result?: any;
  createdAt: number;
}

// ─── Validator ────────────────────────────────────────────────────────

export class SigningRequestValidator {
  private rateLimitWindowMs: number;
  private rateLimitMax: number;
  private idempotencyWindowMs: number;
  private rateLimits: Map<string, RateLimitEntry>;
  private idempotencyCache: Map<string, IdempotencyEntry>;

  constructor(options?: {
    rateLimitWindowMs?: number;
    rateLimitMax?: number;
    idempotencyWindowMs?: number;
  }) {
    this.rateLimitWindowMs = options?.rateLimitWindowMs ?? 60000;
    this.rateLimitMax = options?.rateLimitMax ?? 10;
    this.idempotencyWindowMs = options?.idempotencyWindowMs ?? 300000;
    this.rateLimits = new Map();
    this.idempotencyCache = new Map();
  }

  /**
   * Validate a signing request. Returns errors if invalid.
   */
  validate(request: SigningRequest): ValidationResult {
    const errors: string[] = [];

    // walletId required
    if (!request.walletId || request.walletId.length === 0) {
      errors.push('walletId is required');
    }

    // message required
    if (!request.message || (typeof request.message === 'string' && request.message.length === 0)) {
      errors.push('message is required');
    }

    // chain required + must be supported
    if (!request.chain || request.chain.length === 0) {
      errors.push('chain is required');
    } else {
      try {
        const config = getChainConfig(request.chain as ChainId);
        if (!config.enabled) {
          errors.push(`chain '${request.chain}' is not enabled`);
        }
      } catch {
        errors.push(`chain '${request.chain}' is not supported. Available: stacks, bitcoin, ethereum`);
      }
    }

    // Message must be valid hex or Uint8Array
    if (typeof request.message === 'string') {
      if (!/^[0-9a-fA-F]+$/.test(request.message)) {
        errors.push('message must be hex-encoded');
      }
      if (request.message.length > 65536) {
        errors.push('message too large (max 64KB hex)');
      }
    } else if (request.message.length > 32768) {
      errors.push('message too large (max 32KB)');
    }

    return {
      valid: errors.length === 0,
      errors,
      normalizedChain: errors.length === 0
        ? request.chain as ChainId
        : undefined,
    };
  }

  /**
   * Check rate limit for a wallet. Returns true if allowed.
   */
  checkRateLimit(walletId: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.rateLimits.get(walletId);

    if (!entry || now - entry.windowStart > this.rateLimitWindowMs) {
      // New window
      this.rateLimits.set(walletId, {
        walletId,
        count: 1,
        windowStart: now,
      });
      return {
        allowed: true,
        remaining: this.rateLimitMax - 1,
        resetAt: now + this.rateLimitWindowMs,
      };
    }

    if (entry.count >= this.rateLimitMax) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.windowStart + this.rateLimitWindowMs,
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: this.rateLimitMax - entry.count,
      resetAt: entry.windowStart + this.rateLimitWindowMs,
    };
  }

  /**
   * Check idempotency. Returns cached result if duplicate, null if new.
   */
  checkIdempotency(key: string): { duplicate: boolean; cachedResult?: any } {
    const entry = this.idempotencyCache.get(key);
    if (!entry) {
      this.idempotencyCache.set(key, { key, createdAt: Date.now() });
      return { duplicate: false };
    }

    if (Date.now() - entry.createdAt > this.idempotencyWindowMs) {
      // Expired, treat as new
      this.idempotencyCache.set(key, { key, createdAt: Date.now() });
      return { duplicate: false };
    }

    return { duplicate: true, cachedResult: entry.result };
  }

  /**
   * Store result for idempotency key.
   */
  storeIdempotencyResult(key: string, result: any): void {
    const entry = this.idempotencyCache.get(key);
    if (entry) {
      entry.result = result;
    }
  }

  /**
   * Validate wallet belongs to developer's tenant.
   */
  validateTenant(walletId: string, tenantId: string, developerId?: string): boolean {
    // In production, this queries the DB to verify wallet ownership
    // For now, validate format and tenant isolation
    if (!walletId.startsWith(tenantId + ':')) {
      return false;
    }
    return true;
  }

  /**
   * Clean up expired entries.
   */
  cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.rateLimits) {
      if (now - entry.windowStart > this.rateLimitWindowMs) {
        this.rateLimits.delete(key);
      }
    }

    for (const [key, entry] of this.idempotencyCache) {
      if (now - entry.createdAt > this.idempotencyWindowMs) {
        this.idempotencyCache.delete(key);
      }
    }
  }
}
