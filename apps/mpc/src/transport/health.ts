/**
 * Connection Health — heartbeat monitoring and peer health tracking.
 *
 * Each peer sends HEARTBEAT every 5s. If 3 heartbeats are missed,
 * the peer is marked unhealthy.
 *
 * Health states: connected → unhealthy → disconnected
 */

import { MpcMessageType, type PeerInfo, type HeartbeatConfig } from './types';
import { DEFAULT_HEARTBEAT_CONFIG } from './types';

export type HealthEvent = 'healthy' | 'unhealthy' | 'heartbeat_missed' | 'recovered';

export type HealthCallback = (partyId: number, event: HealthEvent) => void;

export class ConnectionHealth {
  private peers: Map<number, PeerInfo>;
  private timers: Map<number, ReturnType<typeof setInterval>>;
  private config: HeartbeatConfig;
  private onEvent: HealthCallback | null;

  constructor(config?: Partial<HeartbeatConfig>) {
    this.peers = new Map();
    this.timers = new Map();
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
    this.onEvent = null;
  }

  setCallback(cb: HealthCallback): void {
    this.onEvent = cb;
  }

  /**
   * Register a peer and start heartbeat monitoring.
   */
  registerPeer(partyId: number, uri: string): PeerInfo {
    const info: PeerInfo = {
      partyId,
      uri,
      state: 'connected',
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      missedHeartbeats: 0,
      reconnectAttempts: 0,
      nextReconnectAt: null,
    };
    this.peers.set(partyId, info);
    this.startHeartbeat(partyId);
    return info;
  }

  /**
   * Record a received heartbeat from a peer.
   */
  heartbeatReceived(partyId: number): void {
    const peer = this.peers.get(partyId);
    if (!peer) return;

    const wasUnhealthy = peer.state === 'unhealthy';
    peer.lastHeartbeat = Date.now();
    peer.missedHeartbeats = 0;

    if (peer.state !== 'connected') {
      peer.state = 'connected';
      if (wasUnhealthy) {
        this.emit(partyId, 'recovered');
      }
    }
  }

  /**
   * Called to send our own heartbeat to a peer.
   * Returns the heartbeat message envelope fields (type + payload).
   */
  static buildHeartbeat(partyId: number): { type: MpcMessageType; payload: unknown } {
    return {
      type: MpcMessageType.HEARTBEAT,
      payload: {
        timestamp: Date.now(),
        from: partyId,
      },
    };
  }

  /**
   * Check if a peer is healthy.
   */
  isHealthy(partyId: number): boolean {
    const peer = this.peers.get(partyId);
    if (!peer) return false;
    return peer.state === 'connected';
  }

  /**
   * Get all healthy peers.
   */
  getHealthyPeers(): number[] {
    const healthy: number[] = [];
    for (const [id, peer] of this.peers) {
      if (peer.state === 'connected') {
        healthy.push(id);
      }
    }
    return healthy;
  }

  /**
   * Get peer info.
   */
  getPeer(partyId: number): PeerInfo | undefined {
    return this.peers.get(partyId);
  }

  /**
   * Mark a peer as disconnected.
   */
  disconnect(partyId: number): void {
    const peer = this.peers.get(partyId);
    if (peer) {
      peer.state = 'disconnected';
    }
    this.stopHeartbeat(partyId);
  }

  /**
   * Clean up all timers.
   */
  destroy(): void {
    for (const [, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.peers.clear();
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private startHeartbeat(partyId: number): void {
    const existing = this.timers.get(partyId);
    if (existing) clearInterval(existing);

    const timer = setInterval(() => {
      this.checkPeerHealth(partyId);
    }, this.config.intervalMs);

    this.timers.set(partyId, timer);
  }

  private stopHeartbeat(partyId: number): void {
    const timer = this.timers.get(partyId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(partyId);
    }
  }

  private checkPeerHealth(partyId: number): void {
    const peer = this.peers.get(partyId);
    if (!peer || peer.state === 'disconnected') return;

    const elapsed = Date.now() - (peer.lastHeartbeat ?? 0);
    const expectedInterval = this.config.intervalMs + this.config.ackTimeoutMs;

    if (elapsed > expectedInterval) {
      peer.missedHeartbeats++;
      this.emit(partyId, 'heartbeat_missed');

      if (peer.missedHeartbeats >= this.config.maxMissed) {
        peer.state = 'unhealthy';
        this.emit(partyId, 'unhealthy');
      }
    }
  }

  private emit(partyId: number, event: HealthEvent): void {
    if (this.onEvent) {
      try {
        this.onEvent(partyId, event);
      } catch {
        // callback errors should not break heartbeat loop
      }
    }
  }
}
