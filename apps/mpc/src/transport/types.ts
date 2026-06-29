/**
 * Transport Protocol Types — message envelope, session state, encryption.
 *
 * Binary message format (v1):
 *   ┌──────────┬──────────┬────────────┬───────────┬─────────────┬───────────┐
 *   │ Magic(4) │ Type(1)  │ SessLen(2) │ SessionId │ PayloadLen(4)│ Payload   │
 *   │ "MPC1"   │          │ (u16 BE)   │ (UTF-8)   │ (u32 BE)    │ (var)     │
 *   └──────────┴──────────┴────────────┴───────────┴─────────────┴───────────┘
 *
 * Protocol messages:
 *   DKG_ROUND_1 .. DKG_ROUND_3  — Distributed Key Generation rounds
 *   DKG_COMPLETE / DKG_ERROR    — DKG completion/error
 *   SIGN_ROUND_1 .. SIGN_ROUND_2 — Signing ceremony rounds
 *   SIGN_COMPLETE / SIGN_ERROR  — Signing completion/error
 *   ABORT                       — Abort ceremony
 *   HEARTBEAT / HEARTBEAT_ACK   — Connection health
 *   KEY_REFRESH                 — Proactive share refresh (future)
 */

// ─── Message Types ───────────────────────────────────────────────────────

export enum MpcMessageType {
  // DKG protocol
  DKG_ROUND_1 = 0x01,
  DKG_ROUND_2 = 0x02,
  DKG_ROUND_3 = 0x03,
  DKG_COMPLETE = 0x04,
  DKG_ERROR = 0x05,

  // Signing protocol
  SIGN_ROUND_1 = 0x10,
  SIGN_ROUND_2 = 0x11,
  SIGN_COMPLETE = 0x12,
  SIGN_ERROR = 0x13,

  // Control messages
  ABORT = 0x20,
  HEARTBEAT = 0x30,
  HEARTBEAT_ACK = 0x31,

  // Future
  KEY_REFRESH_START = 0x40,
  KEY_REFRESH_ROUND_1 = 0x41,
  KEY_REFRESH_COMPLETE = 0x42,
}

/** Magic bytes for protocol identification */
export const MPC_MAGIC = 0x4d504331; // "MPC1" in hex

/** Current protocol version */
export const PROTOCOL_VERSION = 1;

// ─── Session Types ───────────────────────────────────────────────────────

export type SessionState =
  | 'created'
  | 'active'
  | 'dkg_r1_sent'
  | 'dkg_r2_sent'
  | 'dkg_r3_sent'
  | 'dkg_complete'
  | 'sign_r1_sent'
  | 'sign_r2_sent'
  | 'sign_complete'
  | 'aborted'
  | 'timed_out'
  | 'error';

export type CeremonyType = 'dkg' | 'sign' | 'refresh' | 'recovery';

export interface TransportSession {
  sessionId: string;
  ceremonyType: CeremonyType;
  state: SessionState;
  parties: number[];
  created: number;
  lastActivity: number;
  timeoutMs: number;
  messageCount: number;
}

// ─── Message Envelope ────────────────────────────────────────────────────

export interface MpcMessageEnvelope {
  /** Protocol version */
  version: number;
  /** Message type from MpcMessageType enum */
  type: MpcMessageType;
  /** Ceremony session ID (UUID v4) */
  sessionId: string;
  /** Sender party ID */
  from: number;
  /** Target party ID (0 = broadcast) */
  to: number;
  /** Sequence number for this session (monotonic) */
  sequence: number;
  /** Unix timestamp (ms) when message was created */
  timestamp: number;
  /** Message payload (protocol-specific) */
  payload: unknown;
  /** HMAC signature of the message (for integrity, optional) */
  signature?: Uint8Array;
}

// ─── Heartbeat ──────────────────────────────────────────────────────────

export interface HeartbeatConfig {
  /** Interval between heartbeats (ms) */
  intervalMs: number;
  /** Missed heartbeats before peer is marked unhealthy */
  maxMissed: number;
  /** Timeout waiting for heartbeat ack (ms) */
  ackTimeoutMs: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  intervalMs: 5000,
  maxMissed: 3,
  ackTimeoutMs: 2000,
};

// ─── Reconnection ───────────────────────────────────────────────────────

export interface ReconnectConfig {
  /** Initial backoff (ms) */
  initialDelayMs: number;
  /** Maximum backoff (ms) */
  maxDelayMs: number;
  /** Backoff multiplier */
  factor: number;
  /** Maximum total retry time (ms), 0 = infinite */
  maxTotalMs: number;
  /** Jitter factor (0-1) to avoid thundering herd */
  jitter: number;
}

export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
  maxTotalMs: 0,
  jitter: 0.1,
};

// ─── Connection ─────────────────────────────────────────────────────────

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'unhealthy';

export interface PeerInfo {
  partyId: number;
  uri: string;
  state: ConnectionState;
  connectedAt: number | null;
  lastHeartbeat: number | null;
  missedHeartbeats: number;
  reconnectAttempts: number;
  nextReconnectAt: number | null;
}

// ─── Encryption ─────────────────────────────────────────────────────────

export interface SessionEncryptionKeys {
  /** AES-256-GCM key for message payload encryption */
  encryptionKey: Uint8Array;
  /** HMAC-SHA256 key for message authentication */
  hmacKey: Uint8Array;
  /** Key rotation interval (ms); 0 = no rotation */
  rotationIntervalMs: number;
  /** Last key rotation timestamp */
  lastRotated: number;
}
