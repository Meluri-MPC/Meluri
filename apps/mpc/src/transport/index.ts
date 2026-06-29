/**
 * MPC Transport Layer — message routing, peer communication, in-process transport.
 *
 * Provides:
 *   - MessageRouter: dispatches incoming messages to ceremony-specific handlers
 *   - InProcessTransport: simulates peer-to-peer communication for testing
 *     with message ordering guarantees (FIFO per session) and latency simulation.
 *
 * In production, InProcessTransport is replaced by a WebSocket-based
 * Transport that uses the same MessageRouter.
 */

import { EventEmitter } from 'events';
import {
  MpcMessageType,
  type MpcMessageEnvelope,
  type TransportSession,
  type PeerInfo,
  type SessionEncryptionKeys,
} from './types';
import { encodeMessage, decodeMessage, generateSessionKeys } from './codec';
import { SessionManager } from './session';
import { ConnectionHealth } from './health';
import { ReconnectionManager } from './reconnect';

// ─── Message Handler Types ───────────────────────────────────────────

export type MessageHandler = (
  envelope: MpcMessageEnvelope,
  respond: (type: MpcMessageType, payload: unknown) => void,
) => void | Promise<void>;

export interface TransportEvents {
  message: [envelope: MpcMessageEnvelope];
  connected: [partyId: number, uri: string];
  disconnected: [partyId: number];
  error: [error: Error, partyId?: number];
}

// ─── Message Router ───────────────────────────────────────────────────

export class MessageRouter extends EventEmitter {
  private handlers: Map<MpcMessageType, MessageHandler[]>;
  private sessions: SessionManager;

  constructor(defaultTimeoutMs?: number) {
    super();
    this.handlers = new Map();
    this.sessions = new SessionManager(defaultTimeoutMs);
  }

  /**
   * Register a handler for a specific message type.
   */
  onMessage(type: MpcMessageType, handler: MessageHandler): this {
    const list = this.handlers.get(type) || [];
    list.push(handler);
    this.handlers.set(type, list);
    return this;
  }

  /**
   * Route an incoming message to registered handlers.
   */
  async route(envelope: MpcMessageEnvelope): Promise<void> {
    // Track session state
    if (envelope.sessionId) {
      this.sessions.recordMessage(envelope.sessionId, envelope.type);

      // Check for ABORT
      if (envelope.type === MpcMessageType.ABORT) {
        this.sessions.abort(envelope.sessionId);
      }
    }

    this.emit('message', envelope);

    // Check sequence ordering
    const session = this.sessions.get(envelope.sessionId);
    if (session && envelope.sequence < session.messageCount) {
      // Out-of-order message (TCP/WS already guarantees order, but verify at app layer)
      this.emit('error', new Error(
        `Out-of-order message for session ${envelope.sessionId}: ` +
        `expected seq >= ${session.messageCount}, got ${envelope.sequence}`,
      ));
    }

    // Dispatch to handlers
    const handlers = this.handlers.get(envelope.type) || [];
    for (const handler of handlers) {
      await handler(envelope, (responseType, responsePayload) => {
        // Echo back: sender becomes recipient
        this.emit('message', {
          ...envelope,
          type: responseType,
          from: envelope.to,
          to: envelope.from,
          payload: responsePayload,
          timestamp: Date.now(),
        } as MpcMessageEnvelope);
      });
    }
  }

  /**
   * Get the session manager.
   */
  getSessionManager(): SessionManager {
    return this.sessions;
  }
}

// ─── In-Process Transport ───────────────────────────────────────────────

export interface InProcessTransportOptions {
  /** Simulated network latency (ms), default 5 */
  latencyMs?: number;
  /** Latency jitter (ms), default 2 */
  jitterMs?: number;
  /** Drop rate (0-1), default 0 */
  dropRate?: number;
}

/**
 * In-process transport simulates peer-to-peer communication for testing.
 * All parties are in the same process. Messages are delivered via
 * EventEmitter with optional simulated latency.
 */
export class InProcessTransport {
  private partyId: number;
  private router: MessageRouter;
  private peers: Map<number, InProcessTransport>;
  private options: Required<InProcessTransportOptions>;
  private msgCounter: Map<string, number>;
  private destroyed: boolean;

  constructor(
    partyId: number,
    router: MessageRouter,
    options?: InProcessTransportOptions,
  ) {
    this.partyId = partyId;
    this.router = router;
    this.peers = new Map();
    this.msgCounter = new Map();
    this.destroyed = false;
    this.options = {
      latencyMs: options?.latencyMs ?? 5,
      jitterMs: options?.jitterMs ?? 2,
      dropRate: options?.dropRate ?? 0,
    };
  }

  /**
   * Connect to another transport (bidirectional).
   */
  connect(other: InProcessTransport): void {
    this.peers.set(other.partyId, other);
    other.peers.set(this.partyId, this);
  }

  /**
   * Disconnect from a peer.
   */
  disconnect(partyId: number): void {
    this.peers.delete(partyId);
  }

  /**
   * Send a message to a specific peer.
   */
  send(to: number, type: MpcMessageType, sessionId: string, payload: unknown): void {
    if (this.destroyed) return;

    const peer = this.peers.get(to);
    if (!peer) throw new Error(`Peer ${to} not connected`);

    // Drop message based on drop rate
    if (Math.random() < this.options.dropRate) return;

    // Increment sequence for this session
    const seq = (this.msgCounter.get(sessionId) ?? 0) + 1;
    this.msgCounter.set(sessionId, seq);

    const envelope: MpcMessageEnvelope = {
      version: 1,
      type,
      sessionId,
      from: this.partyId,
      to,
      sequence: seq,
      timestamp: Date.now(),
      payload,
    };

    // Deliver with simulated latency
    const delay = Math.max(0,
      this.options.latencyMs + (Math.random() * 2 - 1) * this.options.jitterMs,
    );

    setTimeout(() => {
      if (!this.destroyed) {
        peer.receive(envelope);
      }
    }, delay);
  }

  /**
   * Broadcast a message to all connected peers.
   */
  broadcast(type: MpcMessageType, sessionId: string, payload: unknown): void {
    for (const [to] of this.peers) {
      this.send(to, type, sessionId, payload);
    }
  }

  /**
   * Receive a message from a peer (called internally).
   */
  private receive(envelope: MpcMessageEnvelope): void {
    if (this.destroyed) return;
    this.router.route(envelope);
  }

  /**
   * Register a message handler on the router.
   */
  onMessage(type: MpcMessageType, handler: MessageHandler): this {
    this.router.onMessage(type, handler);
    return this;
  }

  /**
   * Listen for all messages.
   */
  onAnyMessage(handler: (envelope: MpcMessageEnvelope) => void): this {
    this.router.on('message', handler);
    return this;
  }

  /**
   * Get this transport's party ID.
   */
  getPartyId(): number {
    return this.partyId;
  }

  /**
   * Get connected peer IDs.
   */
  getPeers(): number[] {
    return Array.from(this.peers.keys());
  }

  /**
   * Check if connected to a peer.
   */
  isConnectedTo(partyId: number): boolean {
    return this.peers.has(partyId);
  }

  /**
   * Destroy this transport.
   */
  destroy(): void {
    this.destroyed = true;
    this.peers.clear();
    this.router.removeAllListeners();
  }
}

// ─── Re-export ────────────────────────────────────────────────────────

export {
  encodeMessage,
  decodeMessage,
  generateSessionKeys,
  SessionManager,
  ConnectionHealth,
  ReconnectionManager,
};

export type { SessionEncryptionKeys };
