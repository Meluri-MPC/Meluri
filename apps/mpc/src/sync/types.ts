/**
 * Share Sync Types — share inventory, gossip messages, consistency status.
 */

// ─── Share Inventory ──────────────────────────────────────────────────────

export interface ShareInventoryEntry {
  /** Wallet ID */
  walletId: string;
  /** This node's party index (1, 2, 3) */
  partyIndex: number;
  /** Whether this node holds the share for this wallet */
  hasShare: boolean;
  /** Public key for this wallet (hex) */
  publicKey: string;
  /** Chain this wallet belongs to */
  chain: string;
  /** When the share was last verified */
  lastVerified: number;
  /** Share version number */
  version: number;
}

export interface ShareInventory {
  /** Node's own party ID */
  nodePartyId: number;
  /** All known wallet shares on this node */
  entries: Map<string, ShareInventoryEntry>;
  /** Last inventory update timestamp */
  lastUpdated: number;
}

// ─── Gossip Messages ─────────────────────────────────────────────────────

export type GossipMessageType =
  | 'SHARE_ANNOUNCE'
  | 'SHARE_REQUEST'
  | 'SHARE_RESPONSE'
  | 'INVENTORY_REQUEST'
  | 'INVENTORY_RESPONSE'
  | 'CONSISTENCY_CHECK'
  | 'CONSISTENCY_ACK';

export interface GossipMessage {
  type: GossipMessageType;
  /** Sender party ID */
  from: number;
  /** Target party ID (0 = broadcast) */
  to: number;
  /** Message timestamp */
  timestamp: number;
  /** Message-specific payload */
  payload: unknown;
}

export interface ShareAnnouncePayload {
  walletId: string;
  partyIndex: number;
  publicKey: string;
  version: number;
}

export interface InventoryResponsePayload {
  nodePartyId: number;
  wallets: { walletId: string; partyIndex: number; hasShare: boolean; publicKey: string; version: number }[];
}

export interface ConsistencyCheckPayload {
  wallets: string[];
  /** Hash of all wallet IDs + versions for quick comparison */
  inventoryHash: string;
}

// ─── Consistency ─────────────────────────────────────────────────────────

export type ConsistencyStatus = 'consistent' | 'divergent' | 'incomplete' | 'unknown';

export interface ConsistencyResult {
  status: ConsistencyStatus;
  /** Wallets where this node has a share but peer doesn't */
  localOnly: string[];
  /** Wallets where peer has a share but this node doesn't */
  peerOnly: string[];
  /** Wallets where both have shares but versions differ */
  versionMismatch: { walletId: string; localVersion: number; peerVersion: number }[];
}

// ─── Sync Config ─────────────────────────────────────────────────────────

export interface SyncConfig {
  /** Interval for periodic consistency checks (ms) */
  consistencyCheckIntervalMs: number;
  /** Max wallets to include in a single inventory message */
  maxWalletsPerMessage: number;
  /** Timeout for share requests (ms) */
  requestTimeoutMs: number;
  /** Number of consistency check failures before triggering alert */
  maxConsistencyFailures: number;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  consistencyCheckIntervalMs: 300000, // 5 minutes
  maxWalletsPerMessage: 100,
  requestTimeoutMs: 10000,
  maxConsistencyFailures: 3,
};
