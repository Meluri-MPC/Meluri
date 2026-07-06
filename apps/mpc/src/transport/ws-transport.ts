import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  MpcMessageType,
  type MpcMessageEnvelope,
} from './types';
import { encodeMessage, decodeMessage } from './codec';
import { MessageRouter, type MessageHandler } from './index';
import { ConnectionHealth } from './health';
import { ReconnectionManager } from './reconnect';
import { DEFAULT_HEARTBEAT_CONFIG, DEFAULT_RECONNECT_CONFIG } from './types';

export interface WsTransportOptions {
  partyId: number;
  host: string;
  port: number;
  peerUris: string[];
  heartbeatIntervalMs?: number;
  reconnect?: boolean;
}

/**
 * WebSocket-based MPC transport for production use.
 *
 * Replaces InProcessTransport with real peer-to-peer communication.
 * Each node runs a WS server and connects to peer WS servers.
 */
export class WsTransport extends EventEmitter {
  private partyId: number;
  private host: string;
  private port: number;
  private router: MessageRouter;
  private server: WebSocket.Server | null = null;
  private clients: Map<number, WebSocket> = new Map();
  private peerConnections: Map<number, WebSocket> = new Map();
  private health: ConnectionHealth;
  private reconnectManager: ReconnectionManager;
  private msgCounter: Map<string, number> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(router: MessageRouter, options: WsTransportOptions) {
    super();
    this.partyId = options.partyId;
    this.host = options.host;
    this.port = options.port;
    this.router = router;
    this.health = new ConnectionHealth();
    this.reconnectManager = new ReconnectionManager(DEFAULT_RECONNECT_CONFIG);

    this.health.setCallback((partyId, event) => {
      if (event === 'unhealthy') {
        this.emit('unhealthy', partyId);
      }
    });

    this.reconnectManager.setCallback((event, partyId) => {
      if (event === 'attempt') {
        this.emit('reconnecting', partyId);
      }
    });
  }

  private extractPartyId(uri: string): number {
    try {
      const url = new URL(uri);
      const param = url.searchParams.get('partyId');
      return param ? parseInt(param, 10) : 0;
    } catch {
      return 0;
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = new WebSocket.Server({ host: this.host, port: this.port });

      this.server.on('listening', () => {
        console.log(`[MPC Transport] WebSocket server listening on ws://${this.host}:${this.port}`);
        resolve();
      });

      this.server.on('connection', (ws: WebSocket, req) => {
        const partyId = this.extractPartyIdFromRequest(req);
        if (!partyId) {
          ws.close(4000, 'Missing or invalid partyId');
          return;
        }

        this.clients.set(partyId, ws);
        this.health.registerPeer(partyId, `ws://${req.socket.remoteAddress}:${req.socket.remotePort}`);

        ws.on('message', (data: WebSocket.Data) => {
          try {
            const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
            if (buf.length === 1 && buf[0] === 0x01) {
              this.health.heartbeatReceived(partyId);
              ws.send(Buffer.from([0x02]));
              return;
            }
            const envelope = decodeMessage(buf);
            this.router.route(envelope);
          } catch (err: any) {
            this.emit('error', new Error(`Decode error: ${err.message}`));
          }
        });

        ws.on('close', () => {
          this.clients.delete(partyId);
          this.health.disconnect(partyId);
          this.emit('disconnected', partyId);
        });

        ws.on('error', (err) => {
          this.emit('error', err, partyId);
        });

        this.emit('connected', partyId);
      });

      this.startHeartbeat();
    });
  }

  private extractPartyIdFromRequest(req: any): number | null {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const partyId = url.searchParams.get('partyId');
    return partyId ? parseInt(partyId, 10) : null;
  }

  async connectToPeer(uri: string): Promise<void> {
    const partyId = this.extractPartyId(uri);
    if (!partyId) throw new Error(`Invalid peer URI: ${uri}`);

    if (this.peerConnections.has(partyId)) return;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(uri);

      ws.on('open', () => {
        this.peerConnections.set(partyId, ws);
        this.health.registerPeer(partyId, uri);
        this.reconnectManager.reset(partyId);
        this.emit('connected', partyId);
        resolve();
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
          if (buf.length === 1 && buf[0] === 0x02) {
            this.health.heartbeatReceived(partyId);
            return;
          }
          const envelope = decodeMessage(buf);
          this.router.route(envelope);
        } catch (err: any) {
          this.emit('error', new Error(`Decode error: ${err.message}`));
        }
      });

      ws.on('close', () => {
        this.peerConnections.delete(partyId);
        this.health.disconnect(partyId);
        this.emit('disconnected', partyId);

        if (!this.destroyed && this.peerConnections.size === 0) {
          this.reconnectManager.schedule(partyId, () => this.connectToPeer(uri));
        }
      });

      ws.on('error', (err) => {
        this.emit('error', err, partyId);
        reject(err);
      });
    });
  }

  send(to: number, type: MpcMessageType, sessionId: string, payload: unknown): void {
    if (this.destroyed) return;

    let ws = this.peerConnections.get(to) ?? this.clients.get(to);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Peer ${to} not connected`);
    }

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

    const encoded = encodeMessage(envelope);
    ws.send(encoded);
  }

  broadcast(type: MpcMessageType, sessionId: string, payload: unknown): void {
    for (const [to] of this.peerConnections) {
      try { this.send(to, type, sessionId, payload); } catch {}
    }
    for (const [to] of this.clients) {
      try { this.send(to, type, sessionId, payload); } catch {}
    }
  }

  onMessage(type: MpcMessageType, handler: MessageHandler): this {
    this.router.onMessage(type, handler);
    return this;
  }

  getPartyId(): number {
    return this.partyId;
  }

  getPeers(): number[] {
    const peers = new Set<number>();
    for (const [id] of this.peerConnections) peers.add(id);
    for (const [id] of this.clients) peers.add(id);
    return Array.from(peers);
  }

  getHealthyPeers(): number[] {
    return this.health.getHealthyPeers().filter((id) => this.getPeers().includes(id));
  }

  isConnectedTo(partyId: number): boolean {
    return this.peerConnections.has(partyId) || this.clients.has(partyId);
  }

  private startHeartbeat(): void {
    const interval = DEFAULT_HEARTBEAT_CONFIG.intervalMs;
    this.heartbeatTimer = setInterval(() => {
      const heartbeat = Buffer.from([0x01]);
      for (const [, ws] of this.peerConnections) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(heartbeat); } catch {}
        }
      }
      for (const [, ws] of this.clients) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(heartbeat); } catch {}
        }
      }
    }, interval);
  }

  async stop(): Promise<void> {
    this.destroyed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectManager.destroy();
    this.health.destroy();

    const closePromises: Promise<void>[] = [];

    for (const [, ws] of this.peerConnections) {
      closePromises.push(new Promise((r) => { ws.on('close', r); ws.close(); }));
    }
    for (const [, ws] of this.clients) {
      closePromises.push(new Promise((r) => { ws.on('close', r); ws.close(); }));
    }

    await Promise.allSettled(closePromises);

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
    }

    this.peerConnections.clear();
    this.clients.clear();
  }
}
