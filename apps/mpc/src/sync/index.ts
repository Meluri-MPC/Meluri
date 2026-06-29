/**
 * Share Sync — coordinates share synchronization between MPC nodes.
 *
 * On startup:
 *   1. Connect to peers
 *   2. Request inventory from each peer
 *   3. Compare with local inventory
 *   4. Request missing shares
 *
 * On DKG completion:
 *   1. Broadcast SHARE_ANNOUNCE to all peers
 *   2. Peers update their inventory
 *
 * Periodic:
 *   1. Consistency check every 5 minutes
 *   2. If divergence detected → alert / trigger re-share
 */

import type {
  ShareInventory,
  GossipMessage,
  SyncConfig,
  ConsistencyResult,
} from './types';
import { DEFAULT_SYNC_CONFIG } from './types';
import {
  ShareInventoryStore,
  buildShareAnnounce,
  buildShareRequest,
  buildInventoryRequest,
  buildInventoryResponse,
  buildConsistencyCheck,
} from './gossip';
import { ConsistencyChecker } from './consistency';

// ─── Message Handler Type ─────────────────────────────────────────────────

export type SyncMessageHandler = (
  message: GossipMessage,
  respond?: (msg: GossipMessage) => void,
) => void | Promise<void>;

// ─── Sync Manager ─────────────────────────────────────────────────────────

export class SyncManager {
  private store: ShareInventoryStore;
  private checker: ConsistencyChecker;
  private config: SyncConfig;
  private nodePartyId: number;
  private handler: SyncMessageHandler | null;
  private syncTimer: ReturnType<typeof setInterval> | null;

  constructor(
    nodePartyId: number,
    config?: Partial<SyncConfig>,
  ) {
    this.nodePartyId = nodePartyId;
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
    this.store = new ShareInventoryStore(nodePartyId);
    this.checker = new ConsistencyChecker(config);
    this.handler = null;
    this.syncTimer = null;
  }

  // ── Inventory Management ────────────────────────────────────────────

  /**
   * Add a local share (after DKG completes).
   */
  addLocalShare(walletId: string, publicKey: string, version: number = 1): void {
    this.store.addShare(walletId, this.nodePartyId, publicKey, version);
  }

  /**
   * Process a peer's share announcement.
   */
  onShareAnnounce(walletId: string, partyIndex: number, publicKey: string, version: number): void {
    this.store.recordPeerShare(walletId, partyIndex, publicKey, version);
  }

  /**
   * Get inventory store.
   */
  getStore(): ShareInventoryStore {
    return this.store;
  }

  /**
   * Get consistency checker.
   */
  getChecker(): ConsistencyChecker {
    return this.checker;
  }

  // ── Message Handling ────────────────────────────────────────────────

  /**
   * Handle an incoming gossip message from a peer.
   */
  async handleMessage(
    message: GossipMessage,
    respond: (msg: GossipMessage) => void,
  ): Promise<void> {
    switch (message.type) {
      case 'SHARE_ANNOUNCE': {
        const payload = message.payload as any;
        this.onShareAnnounce(
          payload.walletId,
          payload.partyIndex,
          payload.publicKey,
          payload.version ?? 1,
        );
        break;
      }

      case 'SHARE_REQUEST': {
        const payload = message.payload as any;
        const walletIds: string[] = payload.walletIds ?? [];
        // For each requested wallet, we could send the share (encrypted)
        // This is a placeholder for actual share transfer
        break;
      }

      case 'INVENTORY_REQUEST': {
        const inventory = this.store.buildInventory(this.nodePartyId);
        respond(buildInventoryResponse(
          this.nodePartyId,
          message.from,
          inventory,
        ));
        break;
      }

      case 'INVENTORY_RESPONSE': {
        const payload = message.payload as any;
        const result = this.checker.check(this.store, payload);
        if (result.status !== 'consistent') {
          this.handleDivergence(result, message.from);
        }
        break;
      }

      case 'CONSISTENCY_CHECK': {
        const payload = message.payload as any;
        const localHash = this.store.computeInventoryHash();
        const match = this.checker.quickCheck(localHash, payload.inventoryHash);
        if (!match) {
          // Request full inventory for detailed comparison
          respond(buildInventoryRequest(this.nodePartyId, message.from));
        }
        break;
      }

      default:
        break;
    }

    // Call external handler if set
    if (this.handler) {
      await this.handler(message, respond);
    }
  }

  /**
   * Set an external message handler (for protocol-specific handling).
   */
  setHandler(handler: SyncMessageHandler): void {
    this.handler = handler;
  }

  // ── Periodic Sync ───────────────────────────────────────────────────

  /**
   * Start periodic consistency checks.
   */
  startPeriodicSync(sendFn: (msg: GossipMessage) => void): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(() => {
      const localHash = this.store.computeInventoryHash();
      const walletIds = this.store.getAllWalletIds();
      sendFn(buildConsistencyCheck(this.nodePartyId, walletIds, localHash));
    }, this.config.consistencyCheckIntervalMs);
  }

  /**
   * Stop periodic sync.
   */
  stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // ── DKG Completion ──────────────────────────────────────────────────

  /**
   * Build share announce messages after DKG completes.
   * Call this after a successful DKG ceremony to notify peers.
   */
  buildDkgAnnouncements(
    walletId: string,
    parties: number[],
    publicKey: string,
    versions: number[],
  ): GossipMessage[] {
    const messages: GossipMessage[] = [];

    for (let i = 0; i < parties.length; i++) {
      if (parties[i] !== this.nodePartyId) {
        continue; // Only announce our own share
      }

      const msg = buildShareAnnounce(
        this.nodePartyId,
        walletId,
        parties[i],
        publicKey,
        versions[i] ?? 1,
      );
      messages.push(msg);
    }

    return messages;
  }

  // ── Startup Sync ────────────────────────────────────────────────────

  /**
   * Build inventory request messages for all known peers.
   * Called on node startup.
   */
  buildStartupRequests(knownPeerIds: number[]): GossipMessage[] {
    return knownPeerIds
      .filter((id) => id !== this.nodePartyId)
      .map((id) => buildInventoryRequest(this.nodePartyId, id));
  }

  // ── Divergence Handling ─────────────────────────────────────────────

  private handleDivergence(result: ConsistencyResult, peerId: number): void {
    if (this.checker.isAboveThreshold()) {
      console.warn(
        `[SYNC] Consistency check failed ${this.checker.getFailureCount()} times. ` +
        `Local-only wallets: ${result.localOnly.length}, ` +
        `Peer-only (${peerId}) wallets: ${result.peerOnly.length}, ` +
        `Version mismatches: ${result.versionMismatch.length}`,
      );
    }

    if (this.checker.needsReshare(result)) {
      // In production: trigger re-share ceremony for affected wallets
      // or alert operators via monitoring system
    }
  }

  /**
   * Destroy the sync manager.
   */
  destroy(): void {
    this.stopPeriodicSync();
    this.handler = null;
  }
}
