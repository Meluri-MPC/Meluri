/**
 * Topology types — node identity, cluster configuration, party selection.
 */

// ─── Node Identity ────────────────────────────────────────────────────────

export interface NodeIdentity {
  /** MPC party ID (1, 2, or 3) */
  partyId: number;
  /** Human-readable node name (e.g. "mpc-node-0") */
  name: string;
  /** Ed25519 public key hex (32 bytes, 64 hex chars) for peer auth */
  ed25519PublicKey: string;
  /** Cloud region / availability zone */
  region: string;
  /** Hostname or IP */
  host: string;
  /** WebSocket port */
  port: number;
  /** Full WebSocket URI (ws://host:port) */
  uri: string;
}

// ─── Node Status ─────────────────────────────────────────────────────────

export type NodeStatus = 'online' | 'offline' | 'degraded' | 'unknown';

export interface NodeHealth {
  partyId: number;
  status: NodeStatus;
  /** Last successful heartbeat timestamp */
  lastHeartbeat: number | null;
  /** Current latency in ms (0 = unknown) */
  latencyMs: number;
  /** Number of active signing ceremonies on this node */
  activeCeremonies: number;
  /** Maximum concurrent ceremonies (for load-aware selection) */
  maxCeremonies: number;
  /** Whether this node is eligible for ceremony selection */
  eligible: boolean;
}

// ─── Cluster Configuration ───────────────────────────────────────────────

export interface ClusterConfig {
  /** Cluster name */
  name: string;
  /** Environment (dev/staging/production) */
  environment: 'development' | 'staging' | 'production';
  /** Total number of parties */
  totalParties: number;
  /** Signing threshold */
  threshold: number;
  /** All nodes in the cluster */
  nodes: NodeIdentity[];
}

// ─── Party Selection ─────────────────────────────────────────────────────

export interface SelectionCriteria {
  /** Prefer lower latency */
  preferLowLatency?: boolean;
  /** Prefer lower load (fewer active ceremonies) */
  preferLowLoad?: boolean;
  /** Prefer specific regions */
  preferRegions?: string[];
  /** Exclude specific party IDs */
  excludeParties?: number[];
}

export interface SelectionResult {
  /** Selected party IDs for the ceremony */
  selected: number[];
  /** Reason for selection (for audit) */
  reason: string;
  /** Alternative party in case primary fails (for failover) */
  fallback: number | null;
}

// ─── Discovery ───────────────────────────────────────────────────────────

export type DiscoverySource = 'static' | 'dynamic' | 'environment';

export interface DiscoveryConfig {
  /** Discovery method */
  source: DiscoverySource;
  /** Static peer list (for 'static' source) */
  staticPeers?: string[];
  /** Dynamic discovery endpoint (for 'dynamic' source) */
  endpoint?: string;
  /** Refresh interval for dynamic discovery (ms) */
  refreshIntervalMs?: number;
}

// ─── Cluster Defaults ────────────────────────────────────────────────────

export const DEFAULT_CLUSTER_CONFIG: Partial<ClusterConfig> = {
  totalParties: 3,
  threshold: 2,
  environment: 'development',
};

export const NODE_REGIONS = [
  'us-east-1',
  'us-west-2',
  'eu-west-1',
] as const;

/** Default port range for MPC nodes */
export const DEFAULT_PORT_BASE = 8080;
