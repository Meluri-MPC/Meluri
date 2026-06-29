/**
 * Node Discovery — static configuration + dynamic refresh.
 *
 * Supports:
 *   - Static peer list from env: MPC_PEERS=ws://host1:8080,ws://host2:8080
 *   - Dynamic discovery via periodic refresh (placeholder for etcd/Consul)
 *   - Environment variable-based configuration
 *
 * Usage:
 *   const discovery = new StaticDiscovery(['ws://peer1:8080', 'ws://peer2:8080']);
 *   const peers = discovery.discover(); // Map<partyId, string>
 */

import type { NodeIdentity, DiscoveryConfig } from './types';

// ─── Discovery Interface ──────────────────────────────────────────────────

export interface DiscoveryService {
  /** Get all known peer URIs */
  discover(): Map<number, string>;
  /** Get a specific peer by party ID */
  resolve(partyId: number): string | null;
  /** Start background refresh (for dynamic discovery) */
  start?(): void;
  /** Stop background refresh */
  stop?(): void;
  /** Check if discovery is active */
  isActive(): boolean;
}

// ─── Static Discovery ─────────────────────────────────────────────────────

/**
 * Static discovery using a hardcoded peer list.
 * Reads from `MPC_PEERS` env var or constructor argument.
 *
 * Format: MPC_PEERS=ws://mpc-1:8080,ws://mpc-2:8080,ws://mpc-3:8080
 * Peer URIs are indexed by position: peer 1 = first URI, peer 2 = second, etc.
 */
export class StaticDiscovery implements DiscoveryService {
  private peers: Map<number, string>;
  private active: boolean;

  constructor(peerUris?: string[]) {
    this.peers = new Map();
    this.active = true;

    const uris = peerUris ?? this.parseEnvPeers();
    for (let i = 0; i < uris.length; i++) {
      // Party IDs are 1-indexed
      this.peers.set(i + 1, uris[i]);
    }
  }

  discover(): Map<number, string> {
    return new Map(this.peers);
  }

  resolve(partyId: number): string | null {
    return this.peers.get(partyId) ?? null;
  }

  isActive(): boolean {
    return this.active;
  }

  stop(): void {
    this.active = false;
  }

  /**
   * Add or update a peer.
   */
  setPeer(partyId: number, uri: string): void {
    this.peers.set(partyId, uri);
  }

  /**
   * Remove a peer.
   */
  removePeer(partyId: number): void {
    this.peers.delete(partyId);
  }

  /**
   * Parse MPC_PEERS from environment variable.
   * Format: "ws://mpc-1:8080,ws://mpc-2:8080,ws://mpc-3:8080"
   */
  private parseEnvPeers(): string[] {
    const envPeers = process.env.MPC_PEERS;
    if (!envPeers) {
      // Default: localhost development setup
      return [
        'ws://localhost:8081',
        'ws://localhost:8082',
        'ws://localhost:8083',
      ];
    }

    return envPeers
      .split(',')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
  }

  /**
   * Parse MPC_PEERS from environment and create a StaticDiscovery.
   */
  static fromEnv(): StaticDiscovery {
    return new StaticDiscovery();
  }
}

// ─── Dynamic Discovery ────────────────────────────────────────────────────

/**
 * Dynamic discovery using periodic refresh from a config endpoint.
 * Placeholder for etcd/Consul/API integration.
 *
 * In production, this would:
 *   1. Query a service registry (etcd/Consul)
 *   2. Fetch peer list with health status
 *   3. Update local peer cache
 *   4. Emit events on peer changes
 */
export class DynamicDiscovery implements DiscoveryService {
  private peers: Map<number, string>;
  private active: boolean;
  private refreshTimer: ReturnType<typeof setInterval> | null;
  private refreshIntervalMs: number;
  private endpoint: string;

  constructor(config: { endpoint: string; refreshIntervalMs?: number }) {
    this.peers = new Map();
    this.active = false;
    this.refreshTimer = null;
    this.endpoint = config.endpoint;
    this.refreshIntervalMs = config.refreshIntervalMs ?? 30000;
  }

  discover(): Map<number, string> {
    return new Map(this.peers);
  }

  resolve(partyId: number): string | null {
    return this.peers.get(partyId) ?? null;
  }

  isActive(): boolean {
    return this.active;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.refresh();

    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, this.refreshIntervalMs);
  }

  stop(): void {
    this.active = false;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Update from a programmatic source (e.g., test fixtures).
   */
  update(peers: Map<number, string>): void {
    this.peers = new Map(peers);
  }

  private async refresh(): Promise<void> {
    try {
      // Placeholder: in production, fetch from service registry
      // const response = await fetch(this.endpoint);
      // const data = await response.json();
      // this.peers = new Map(Object.entries(data.peers));
    } catch {
      // Keep current peer list on failure
    }
  }
}

// ─── Discovery Factory ────────────────────────────────────────────────────

/**
 * Create the appropriate discovery service from configuration.
 */
export function createDiscovery(config: DiscoveryConfig): DiscoveryService {
  switch (config.source) {
    case 'static':
      return new StaticDiscovery(config.staticPeers);
    case 'dynamic':
      return new DynamicDiscovery({
        endpoint: config.endpoint ?? 'http://localhost:8500/v1/kv/mpc-peers',
        refreshIntervalMs: config.refreshIntervalMs,
      });
    case 'environment':
      return StaticDiscovery.fromEnv();
    default:
      return StaticDiscovery.fromEnv();
  }
}
