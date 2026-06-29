/**
 * Gossip Protocol — share announcement and propagation between MPC nodes.
 *
 * After a DKG ceremony completes, each node broadcasts a SHARE_ANNOUNCE
 * to peers. Nodes maintain an inventory of known shares and can request
 * missing shares on startup or during periodic consistency checks.
 */

import type {
  GossipMessage,
  ShareAnnouncePayload,
  InventoryResponsePayload,
  ConsistencyCheckPayload,
  ShareInventory,
  ShareInventoryEntry,
} from './types';
import { sha256 } from '@noble/hashes/sha256';

// ─── Share Inventory ──────────────────────────────────────────────────────

export class ShareInventoryStore {
  private nodePartyId: number;
  private entries: Map<string, ShareInventoryEntry>;
  private lastUpdated: number;

  constructor(nodePartyId: number) {
    this.nodePartyId = nodePartyId;
    this.entries = new Map();
    this.lastUpdated = Date.now();
  }

  /**
   * Record that this node holds a share for a wallet.
   */
  addShare(walletId: string, partyIndex: number, publicKey: string, version: number = 1): void {
    const key = `${walletId}:${partyIndex}`;
    this.entries.set(key, {
      walletId,
      partyIndex,
      hasShare: true,
      publicKey,
      chain: 'unknown',
      lastVerified: Date.now(),
      version,
    });
    this.lastUpdated = Date.now();
  }

  /**
   * Record that a peer holds a share (learned via gossip).
   */
  recordPeerShare(
    walletId: string,
    partyIndex: number,
    publicKey: string,
    version: number = 1,
  ): void {
    const key = `${walletId}:${partyIndex}`;
    // Don't overwrite local share status
    if (!this.entries.has(key)) {
      this.entries.set(key, {
        walletId,
        partyIndex,
        hasShare: partyIndex === this.nodePartyId,
        publicKey,
        chain: 'unknown',
        lastVerified: Date.now(),
        version,
      });
    }
    this.lastUpdated = Date.now();
  }

  /**
   * Check if this node holds a specific share.
   */
  hasShare(walletId: string, partyIndex: number): boolean {
    const key = `${walletId}:${partyIndex}`;
    const entry = this.entries.get(key);
    return entry?.hasShare === true;
  }

  /**
   * Get all wallets that this node holds shares for.
   */
  getOwnWallets(): ShareInventoryEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.partyIndex === this.nodePartyId && e.hasShare,
    );
  }

  /**
   * Get all known wallet IDs (from any party).
   */
  getAllWalletIds(): string[] {
    const ids = new Set<string>();
    for (const entry of this.entries.values()) {
      ids.add(entry.walletId);
    }
    return Array.from(ids);
  }

  /**
   * Get wallets where a specific party's share is missing.
   */
  getMissingShares(partyId: number): string[] {
    const ownWallets = this.getOwnWallets();
    return ownWallets
      .filter((entry) => {
        const peerKey = `${entry.walletId}:${partyId}`;
        return !this.entries.has(peerKey);
      })
      .map((e) => e.walletId);
  }

  /**
   * Build an inventory response for a peer.
   */
  buildInventory(partyId: number, maxEntries: number = 100): InventoryResponsePayload {
    const wallets: InventoryResponsePayload['wallets'] = [];
    const seen = new Set<string>();

    for (const entry of this.entries.values()) {
      const key = `${entry.walletId}:${entry.partyIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);

      wallets.push({
        walletId: entry.walletId,
        partyIndex: entry.partyIndex,
        hasShare: entry.hasShare,
        publicKey: entry.publicKey,
        version: entry.version,
      });

      if (wallets.length >= maxEntries) break;
    }

    return {
      nodePartyId: this.nodePartyId,
      wallets,
    };
  }

  /**
   * Compute an inventory hash for quick consistency comparison.
   */
  computeInventoryHash(): string {
    const walletIds = this.getOwnWallets()
      .map((e) => `${e.walletId}:v${e.version}`)
      .sort()
      .join(',');

    return Buffer.from(sha256(walletIds)).toString('hex').slice(0, 16);
  }

  /**
   * Get inventory metadata.
   */
  getInventory(): ShareInventory {
    return {
      nodePartyId: this.nodePartyId,
      entries: new Map(this.entries),
      lastUpdated: this.lastUpdated,
    };
  }

  /**
   * Get share count by party.
   */
  countByParty(): Map<number, number> {
    const counts = new Map<number, number>();
    for (const entry of this.entries.values()) {
      if (entry.hasShare) {
        counts.set(entry.partyIndex, (counts.get(entry.partyIndex) ?? 0) + 1);
      }
    }
    return counts;
  }
}

// ─── Message Builders ─────────────────────────────────────────────────────

/**
 * Build a SHARE_ANNOUNCE message after DKG completes.
 */
export function buildShareAnnounce(
  from: number,
  walletId: string,
  partyIndex: number,
  publicKey: string,
  version: number = 1,
): GossipMessage {
  return {
    type: 'SHARE_ANNOUNCE',
    from,
    to: 0, // broadcast
    timestamp: Date.now(),
    payload: { walletId, partyIndex, publicKey, version } as ShareAnnouncePayload,
  };
}

/**
 * Build a SHARE_REQUEST message to request missing shares.
 */
export function buildShareRequest(
  from: number,
  to: number,
  walletIds: string[],
): GossipMessage {
  return {
    type: 'SHARE_REQUEST',
    from,
    to,
    timestamp: Date.now(),
    payload: { walletIds },
  };
}

/**
 * Build an INVENTORY_REQUEST message.
 */
export function buildInventoryRequest(from: number, to: number): GossipMessage {
  return {
    type: 'INVENTORY_REQUEST',
    from,
    to,
    timestamp: Date.now(),
    payload: { requestTime: Date.now() },
  };
}

/**
 * Build an INVENTORY_RESPONSE message.
 */
export function buildInventoryResponse(
  from: number,
  to: number,
  inventory: InventoryResponsePayload,
): GossipMessage {
  return {
    type: 'INVENTORY_RESPONSE',
    from,
    to,
    timestamp: Date.now(),
    payload: inventory,
  };
}

/**
 * Build a CONSISTENCY_CHECK message.
 */
export function buildConsistencyCheck(
  from: number,
  walletIds: string[],
  inventoryHash: string,
): GossipMessage {
  return {
    type: 'CONSISTENCY_CHECK',
    from,
    to: 0,
    timestamp: Date.now(),
    payload: { wallets: walletIds, inventoryHash } as ConsistencyCheckPayload,
  };
}
