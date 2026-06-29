/**
 * MPC Node Topology — cluster management, node identity, discovery, party selection.
 *
 * Manages the 3-node MPC cluster:
 *   mpc-node-0 → party 1 (us-east-1)
 *   mpc-node-1 → party 2 (us-west-2)
 *   mpc-node-2 → party 3 (eu-west-1)
 *
 * Usage:
 *   import { ClusterManager } from '../topology';
 *   const cluster = ClusterManager.createDefault();
 *   cluster.startDiscovery();
 *   const selection = cluster.selectParties();
 */

import type {
  NodeIdentity,
  NodeHealth,
  ClusterConfig,
  SelectionCriteria,
  SelectionResult,
  DiscoveryConfig,
} from './types';
import { DEFAULT_CLUSTER_CONFIG, NODE_REGIONS, DEFAULT_PORT_BASE } from './types';
import {
  generateNodeIdentity,
  createNodeIdentity,
  signChallenge,
  verifyChallenge,
  generateAuthChallenge,
  authenticatePeer,
  type Ed25519Identity,
} from './identity';
import {
  StaticDiscovery,
  DynamicDiscovery,
  createDiscovery,
  type DiscoveryService,
} from './discovery';
import { PartySelector } from './selector';

// ─── Cluster Manager ──────────────────────────────────────────────────────

export class ClusterManager {
  private config: ClusterConfig;
  private identities: Map<number, Ed25519Identity>;
  private discovery: DiscoveryService;
  private selector: PartySelector;
  private ownPartyId: number;

  constructor(
    config: ClusterConfig,
    ownPartyId: number,
    discovery: DiscoveryService,
  ) {
    this.config = config;
    this.ownPartyId = ownPartyId;
    this.identities = new Map();
    this.discovery = discovery;
    this.selector = new PartySelector();

    // Generate identities for all nodes
    for (const node of config.nodes) {
      const id = generateNodeIdentity();
      this.identities.set(node.partyId, id);
    }
  }

  // ── Info ──────────────────────────────────────────────────────────────

  getConfig(): ClusterConfig {
    return this.config;
  }

  getOwnPartyId(): number {
    return this.ownPartyId;
  }

  getOwnNode(): NodeIdentity {
    return this.config.nodes.find((n) => n.partyId === this.ownPartyId)!;
  }

  getNode(partyId: number): NodeIdentity | undefined {
    return this.config.nodes.find((n) => n.partyId === partyId);
  }

  getAllNodes(): NodeIdentity[] {
    return [...this.config.nodes];
  }

  getOtherNodes(): NodeIdentity[] {
    return this.config.nodes.filter((n) => n.partyId !== this.ownPartyId);
  }

  getIdentity(partyId: number): Ed25519Identity | undefined {
    return this.identities.get(partyId);
  }

  getOwnIdentity(): Ed25519Identity {
    return this.identities.get(this.ownPartyId)!;
  }

  // ── Discovery ─────────────────────────────────────────────────────────

  startDiscovery(): void {
    this.discovery.start?.();
  }

  stopDiscovery(): void {
    this.discovery.stop?.();
  }

  getPeerUri(partyId: number): string | null {
    return this.discovery.resolve(partyId);
  }

  getAllPeers(): Map<number, string> {
    return this.discovery.discover();
  }

  // ── Health ────────────────────────────────────────────────────────────

  updateNodeHealth(health: NodeHealth): void {
    this.selector.updateHealth(health);
  }

  getNodeHealth(partyId: number): NodeHealth | undefined {
    return this.selector.getHealth(partyId);
  }

  getAllHealth(): NodeHealth[] {
    return this.selector.getAllHealth();
  }

  // ── Party Selection ──────────────────────────────────────────────────

  selectParties(criteria?: SelectionCriteria): SelectionResult {
    return this.selector.select(2, criteria);
  }

  selectPartiesAsCoordinator(criteria?: SelectionCriteria): SelectionResult {
    return this.selector.selectWithCoordinator(this.ownPartyId, criteria);
  }

  selectWithExclusions(excludedParties: number[]): SelectionResult {
    return this.selector.select(2, { excludeParties: excludedParties });
  }

  // ── Health Initialization ─────────────────────────────────────────────

  /**
   * Initialize default health entries for all nodes.
   * Called after cluster setup, before heartbeats begin.
   */
  initializeHealth(): void {
    for (const node of this.config.nodes) {
      this.selector.updateHealth({
        partyId: node.partyId,
        status: 'unknown',
        lastHeartbeat: null,
        latencyMs: 0,
        activeCeremonies: 0,
        maxCeremonies: 10,
        eligible: true,
      });
    }
  }

  /**
   * Mark nodes as online (for testing / static topology).
   */
  markAllOnline(): void {
    for (const node of this.config.nodes) {
      this.selector.updateHealth({
        partyId: node.partyId,
        status: 'online',
        lastHeartbeat: Date.now(),
        latencyMs: 10 + node.partyId * 5,
        activeCeremonies: 0,
        maxCeremonies: 10,
        eligible: true,
      });
    }
  }

  // ─── Static Factories ──────────────────────────────────────────────────

  static createDefault(ownPartyId: number = 1): ClusterManager {
    const nodes: NodeIdentity[] = [
      createNodeIdentity(1, 'localhost', DEFAULT_PORT_BASE + 1, NODE_REGIONS[0]),
      createNodeIdentity(2, 'localhost', DEFAULT_PORT_BASE + 2, NODE_REGIONS[1]),
      createNodeIdentity(3, 'localhost', DEFAULT_PORT_BASE + 3, NODE_REGIONS[2]),
    ];

    const config: ClusterConfig = {
      name: 'velumx-mpc-cluster',
      environment: 'development',
      totalParties: 3,
      threshold: 2,
      nodes,
    };

    const discovery = new StaticDiscovery(
      nodes.filter((n) => n.partyId !== ownPartyId).map((n) => n.uri),
    );

    return new ClusterManager(config, ownPartyId, discovery);
  }

  static fromNodes(
    nodes: NodeIdentity[],
    ownPartyId: number,
    peerUris?: string[],
  ): ClusterManager {
    const config: ClusterConfig = {
      name: 'velumx-mpc-cluster',
      environment: 'production',
      totalParties: nodes.length,
      threshold: 2,
      nodes,
    };

    const discovery = new StaticDiscovery(peerUris);

    return new ClusterManager(config, ownPartyId, discovery);
  }
}

// ─── Re-export ────────────────────────────────────────────────────────────

export {
  generateNodeIdentity,
  createNodeIdentity,
  signChallenge,
  verifyChallenge,
  generateAuthChallenge,
  authenticatePeer,
  StaticDiscovery,
  DynamicDiscovery,
  createDiscovery,
  PartySelector,
};

export type { Ed25519Identity, DiscoveryService };

export type {
  NodeIdentity,
  NodeHealth,
  ClusterConfig,
  SelectionCriteria,
  SelectionResult,
  DiscoveryConfig,
};
