/**
 * Consistency Checker — detects and reports share discrepancies between nodes.
 *
 * Runs periodic checks: compares this node's share inventory against
 * peer inventories. If a node has a share that a peer is missing
 * (or vice versa), it flags the discrepancy.
 *
 * If discrepancies accumulate beyond maxConsistencyFailures,
 * the system can trigger a re-share ceremony or alert operators.
 */

import { sha256 } from '@noble/hashes/sha256';
import type {
  ConsistencyResult,
  ConsistencyStatus,
  ShareInventoryEntry,
  InventoryResponsePayload,
  SyncConfig,
} from './types';
import { DEFAULT_SYNC_CONFIG } from './types';
import { ShareInventoryStore } from './gossip';

// ─── Consistency Checker ─────────────────────────────────────────────────

export class ConsistencyChecker {
  private config: SyncConfig;
  private failureCount: number;

  constructor(config?: Partial<SyncConfig>) {
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
    this.failureCount = 0;
  }

  /**
   * Compare this node's inventory with a peer's inventory response.
   */
  check(
    localStore: ShareInventoryStore,
    peerResponse: InventoryResponsePayload,
  ): ConsistencyResult {
    const localWallets = localStore.getOwnWallets();
    const localWalletIds = new Set(localWallets.map((e) => e.walletId));
    const peerWalletIds = new Set(peerResponse.wallets.map((e) => e.walletId));

    // Wallets local has but peer doesn't
    const localOnly = Array.from(localWalletIds).filter((id) => !peerWalletIds.has(id));

    // Wallets peer has but local doesn't
    const peerOnly = Array.from(peerWalletIds).filter((id) => !localWalletIds.has(id));

    // Version mismatches
    const versionMismatch: ConsistencyResult['versionMismatch'] = [];
    for (const local of localWallets) {
      const peer = peerResponse.wallets.find(
        (p) => p.walletId === local.walletId && p.partyIndex === local.partyIndex,
      );
      if (peer && peer.version !== local.version) {
        versionMismatch.push({
          walletId: local.walletId,
          localVersion: local.version,
          peerVersion: peer.version,
        });
      }
    }

    const hasIssues = localOnly.length > 0 || peerOnly.length > 0 || versionMismatch.length > 0;
    const status: ConsistencyStatus = hasIssues ? 'divergent' : 'consistent';

    if (hasIssues) {
      this.failureCount++;
    } else {
      this.failureCount = 0;
    }

    return { status, localOnly, peerOnly, versionMismatch };
  }

  /**
   * Quick consistency check using inventory hashes.
   * Returns false if hashes don't match (probable divergence).
   */
  quickCheck(localHash: string, peerHash: string): boolean {
    const match = localHash === peerHash;
    if (!match) {
      this.failureCount++;
    } else {
      this.failureCount = 0;
    }
    return match;
  }

  /**
   * Check if this node has all expected shares for a wallet.
   * A node should have shares where partyIndex = this node's party ID.
   */
  hasExpectedShares(
    store: ShareInventoryStore,
    walletId: string,
    expectedPartyIndex: number,
  ): boolean {
    return store.hasShare(walletId, expectedPartyIndex);
  }

  /**
   * Find missing shares for a specific party across all wallets.
   */
  findMissingShares(
    store: ShareInventoryStore,
    partyId: number,
  ): string[] {
    return store.getMissingShares(partyId);
  }

  /**
   * Check if failures exceed the configured threshold.
   */
  isAboveThreshold(): boolean {
    return this.failureCount >= this.config.maxConsistencyFailures;
  }

  /**
   * Get current failure count.
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset failure count.
   */
  resetFailures(): void {
    this.failureCount = 0;
  }

  /**
   * Check if a re-share is needed for a specific wallet.
   *
   * Re-share may be needed when:
   *   - A node is permanently offline (share lost)
   *   - Share version is stale (key rotation happened)
   */
  needsReshare(result: ConsistencyResult): boolean {
    // If a peer has wallets that we don't, those shares may be lost
    // If localOnly is large, this node's shares may have diverged
    return (
      result.localOnly.length > 0 ||
      result.peerOnly.length > 0 ||
      result.versionMismatch.length > 0
    );
  }
}
