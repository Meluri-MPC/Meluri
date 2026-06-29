/**
 * MPC Signing Service — orchestration layer bridging gRPC/REST to TSS signing.
 */

import { SigningCeremony, type SigningResult } from '../signing';
import { SigningRequestValidator, type SigningRequest } from '../signing/validation';
import { SigningCoordinator, type CeremonyState } from '../signing/coordinator';
import { ConcurrencyManager } from '../signing/concurrency';
import { SigningAuditLogger } from '../signing/audit';
import { PartySelector } from '../topology/selector';
import { ConnectionHealth } from '../transport/health';
import type { ChainId } from '../chains/types';
import {
  signingTotal,
  signingErrorsTotal,
  signingDurationSeconds,
  activeCeremonies,
  peerConnections,
  walletSharesCount,
  peerDisconnectsTotal,
} from '../metrics';

// ─── Types ────────────────────────────────────────────────────────

export interface GrpcSignRequest {
  walletId: string;
  message: Uint8Array;
  chain: string;
  publicKey: string;
  tenantId: string;
  apiKey?: string;
  idempotencyKey?: string;
}

export interface GrpcSignResponse {
  signature: string;
  r: string;
  s: string;
  recoveryId: number;
  ceremonyId: string;
  chain: string;
  timestamp: number;
  durationMs: number;
}

export interface GrpcCeremonyStatus {
  ceremonyId: string;
  status: string;
  selectedParties: number[];
  startedAt: number;
  lastActivity: number;
  error?: string;
}

// ─── Service ──────────────────────────────────────────────────────

import { Injectable } from '@nestjs/common';

@Injectable()
export class MpcSigningService {
  private validator: SigningRequestValidator;
  private coordinator: SigningCoordinator;
  private concurrency: ConcurrencyManager;
  private audit: SigningAuditLogger;
  private health: ConnectionHealth;
  private selector: PartySelector;

  // In-memory share store (production: KMS-backed DB)
  private shareStore: Map<string, { shares: Map<number, bigint>; publicKey: string }>;

  constructor() {
    this.validator = new SigningRequestValidator();
    this.health = new ConnectionHealth();
    this.selector = new PartySelector();
    this.coordinator = new SigningCoordinator({
      selector: this.selector,
      health: this.health,
    });
    this.concurrency = new ConcurrencyManager();
    this.audit = new SigningAuditLogger();
    this.shareStore = new Map();

    // Initialize topology health (all 3 nodes online)
    for (const partyId of [1, 2, 3]) {
      this.health.registerPeer(partyId, `mpc-node-${partyId}:4003`);
      this.health.heartbeatReceived(partyId);
    }
    peerConnections.set(3);

    this.health.setCallback((_partyId, event) => {
      if (event === 'unhealthy') {
        peerDisconnectsTotal.inc();
        const healthy = this.health.getHealthyPeers().length;
        peerConnections.set(healthy);
      }
      if (event === 'recovered' || event === 'healthy') {
        const healthy = this.health.getHealthyPeers().length;
        peerConnections.set(healthy);
      }
    });
  }

  /**
   * Register wallet shares (called after DKG completes).
   */
  registerShares(walletId: string, shares: Map<number, bigint>, publicKey: string): void {
    this.shareStore.set(walletId, { shares, publicKey });
    walletSharesCount.set(this.shareStore.size);
  }

  /**
   * Execute a signing ceremony.
   */
  async sign(request: GrpcSignRequest): Promise<GrpcSignResponse> {
    const startTime = Date.now();
    signingTotal.inc({ chain: request.chain });

    try {
      // 1. Validate request
      const validationResult = this.validator.validate(request as unknown as SigningRequest);
      if (!validationResult.valid) {
        throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
      }

      // 2. Check rate limit
      const rateLimit = this.validator.checkRateLimit(request.walletId);
      if (!rateLimit.allowed) {
        throw new Error('Rate limit exceeded');
      }

      // 3. Check idempotency
      if (request.idempotencyKey) {
        const idempotency = this.validator.checkIdempotency(request.idempotencyKey);
        if (idempotency.duplicate && idempotency.cachedResult) {
          return idempotency.cachedResult;
        }
      }

      // 4. Look up shares
      const shareEntry = this.shareStore.get(request.walletId);
      if (!shareEntry) {
        throw new Error(`No shares found for wallet '${request.walletId}'`);
      }

      // 5. Concurrency: acquire lock
      const requestId = `grpc-${Date.now()}`;
      await this.concurrency.submit(
        request.walletId,
        Buffer.from(request.message).toString('hex'),
        request.chain,
        requestId,
      );

      // 6. Select parties
      const selection = this.coordinator.selectParties(request.walletId);
      if (selection.selected.length !== 2) {
        throw new Error('Could not select 2 healthy parties');
      }

      const [partyA, partyB] = selection.selected;

      // 7. Start ceremony
      const ceremony = this.coordinator.startCeremony(
        request.walletId,
        Buffer.from(request.message).toString('hex'),
        request.chain,
        selection.selected,
        selection.fallback ?? null,
      );

      activeCeremonies.inc();
      try {
        // 8. Execute signing ceremony
        const result: SigningResult = SigningCeremony.sign(
          ceremony.ceremonyId,
          partyA,
          shareEntry.shares.get(partyA)!,
          partyB,
          shareEntry.shares.get(partyB)!,
          request.message,
          request.publicKey || shareEntry.publicKey,
        );

        // 9. Complete ceremony
        this.coordinator.completeCeremony(ceremony.ceremonyId, result.hex);
        this.concurrency.complete(request.walletId, result);

        const durationMs = Date.now() - startTime;

        // 10. Audit
        this.audit.log({
          ceremonyId: ceremony.ceremonyId,
          walletId: request.walletId,
          developerId: request.apiKey || 'unknown',
          chain: request.chain,
          messageHash: Buffer.from(request.message).toString('hex'),
          partyIds: selection.selected,
          success: true,
          durationMs,
        });

        signingDurationSeconds.observe({ chain: request.chain }, durationMs / 1000);

        const response: GrpcSignResponse = {
          signature: result.hex,
          r: result.r.toString(),
          s: result.s.toString(),
          recoveryId: result.recoveryId,
          ceremonyId: ceremony.ceremonyId,
          chain: request.chain,
          timestamp: Date.now(),
          durationMs,
        };

        // Cache for idempotency
        if (request.idempotencyKey) {
          this.validator.storeIdempotencyResult(request.idempotencyKey, response);
        }

        return response;
      } finally {
        activeCeremonies.dec();
      }
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      signingErrorsTotal.inc({ chain: request.chain, error: error.message || 'unknown' });
      signingDurationSeconds.observe({ chain: request.chain }, durationMs / 1000);

      this.concurrency.fail(request.walletId, error);
      this.audit.log({
        ceremonyId: `ceremony-${request.walletId}-${startTime}`,
        walletId: request.walletId,
        developerId: request.apiKey || 'unknown',
        chain: request.chain,
        messageHash: Buffer.from(request.message).toString('hex'),
        partyIds: [],
        success: false,
        error: error.message,
        durationMs,
      });
      throw error;
    }
  }

  /**
   * Get ceremony status.
   */
  getCeremonyStatus(ceremonyId: string): GrpcCeremonyStatus | null {
    const state = this.coordinator.getCeremony(ceremonyId);
    if (!state) return null;

    return {
      ceremonyId: state.ceremonyId,
      status: state.status,
      selectedParties: state.selectedParties,
      startedAt: state.startedAt,
      lastActivity: state.lastActivity,
      error: state.error,
    };
  }

  /**
   * Get concurrency stats.
   */
  getStats() {
    return this.concurrency.getStats();
  }

  /**
   * Get audit logs for a wallet.
   */
  getAuditLogs(walletId?: string, developerId?: string) {
    if (walletId) return this.audit.getByWallet(walletId);
    if (developerId) return this.audit.getByDeveloper(developerId);
    return this.audit.getRecent();
  }

  /**
   * Cancel a pending signing ceremony.
   */
  cancelCeremony(ceremonyId: string): { cancelled: boolean; ceremonyId: string } {
    const state = this.coordinator.getCeremony(ceremonyId);
    if (!state || state.status === 'completed' || state.status === 'failed' || state.status === 'timed_out') {
      return { cancelled: false, ceremonyId };
    }
    this.coordinator.failCeremony(ceremonyId, 'Cancelled by request');
    this.concurrency.fail(state.walletId, new Error('Cancelled'));
    return { cancelled: true, ceremonyId };
  }

  /**
   * Cleanup expired entries.
   */
  cleanup(): void {
    this.validator.cleanup();
    this.coordinator.cleanupTimeouts();
    this.coordinator.cleanup();
    this.concurrency.cleanup();
  }
}
