/**
 * Session State Machine — manages MPC ceremony session lifecycle.
 *
 * Tracks state transitions for DKG and signing ceremonies,
 * enforces valid transitions, and handles timeouts.
 */

import { performance } from 'perf_hooks';
import { MpcMessageType, type TransportSession, type SessionState } from './types';

// ─── Session Manager ─────────────────────────────────────────────────

export class SessionManager {
  private sessions: Map<string, TransportSession>;
  private timeouts: Map<string, ReturnType<typeof setTimeout>>;
  private defaultTimeoutMs: number;

  constructor(defaultTimeoutMs: number = 30000) {
    this.sessions = new Map();
    this.timeouts = new Map();
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Create a new ceremony session.
   */
  create(
    sessionId: string,
    ceremonyType: TransportSession['ceremonyType'],
    parties: number[],
    timeoutMs?: number,
  ): TransportSession {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const session: TransportSession = {
      sessionId,
      ceremonyType,
      state: 'created',
      parties,
      created: Date.now(),
      lastActivity: Date.now(),
      timeoutMs: timeoutMs ?? this.defaultTimeoutMs,
      messageCount: 0,
    };

    this.sessions.set(sessionId, session);
    this.resetTimeout(sessionId);
    return session;
  }

  /**
   * Record an incoming message for a session, updating state and activity.
   */
  recordMessage(sessionId: string, type: MpcMessageType): void {
    const session = this.get(sessionId);
    if (!session) return;

    session.lastActivity = Date.now();
    session.messageCount++;

    const newState = this.deriveState(type);
    if (newState) {
      session.state = newState;
    }

    this.resetTimeout(sessionId);
  }

  /**
   * Get the current state of a session.
   */
  getState(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId)?.state ?? null;
  }

  /**
   * Get session info.
   */
  get(sessionId: string): TransportSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Transition to a specific state.
   */
  transition(sessionId: string, state: SessionState): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.state = state;
    session.lastActivity = Date.now();
    this.resetTimeout(sessionId);
  }

  /**
   * Check if a session has timed out.
   */
  isTimedOut(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return true;
    return Date.now() - session.lastActivity > session.timeoutMs;
  }

  /**
   * Check if a transition is valid.
   */
  isValidTransition(sessionId: string, toState: SessionState): boolean {
    const current = this.sessions.get(sessionId)?.state;
    if (!current) return false;

    // Valid transitions
    const validTransitions: Record<SessionState, SessionState[]> = {
      created: ['dkg_r1_sent', 'sign_r1_sent'],
      active: ['dkg_r1_sent', 'sign_r1_sent'],
      dkg_r1_sent: ['dkg_r2_sent'],
      dkg_r2_sent: ['dkg_r3_sent'],
      dkg_r3_sent: ['dkg_complete'],
      dkg_complete: [],
      sign_r1_sent: ['sign_r2_sent'],
      sign_r2_sent: ['sign_complete'],
      sign_complete: [],
      aborted: [],
      timed_out: [],
      error: [],
    };

    return (validTransitions[current] ?? []).includes(toState);
  }

  /**
   * Abort a session.
   */
  abort(sessionId: string): void {
    this.transition(sessionId, 'aborted');
    this.clearTimeout(sessionId);
  }

  /**
   * Get all active sessions (not completed/aborted/timed out).
   */
  getActiveSessions(): TransportSession[] {
    const terminal: SessionState[] = ['dkg_complete', 'sign_complete', 'aborted', 'timed_out', 'error'];
    return Array.from(this.sessions.values()).filter(
      (s) => !terminal.includes(s.state),
    );
  }

  /**
   * Clean up completed or timed out sessions.
   */
  cleanup(): TransportSession[] {
    const removed: TransportSession[] = [];
    const terminal: SessionState[] = ['dkg_complete', 'sign_complete', 'aborted', 'timed_out', 'error'];

    for (const [id, session] of this.sessions) {
      if (terminal.includes(session.state) || this.isTimedOut(id)) {
        this.clearTimeout(id);
        this.sessions.delete(id);
        removed.push(session);
      }
    }

    return removed;
  }

  /**
   * Destroy all sessions.
   */
  destroy(): void {
    for (const [id] of this.timeouts) {
      this.clearTimeout(id);
    }
    this.sessions.clear();
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private deriveState(type: MpcMessageType): SessionState | null {
    const map: Partial<Record<MpcMessageType, SessionState>> = {
      [MpcMessageType.DKG_ROUND_1]: 'dkg_r1_sent',
      [MpcMessageType.DKG_ROUND_2]: 'dkg_r2_sent',
      [MpcMessageType.DKG_ROUND_3]: 'dkg_r3_sent',
      [MpcMessageType.DKG_COMPLETE]: 'dkg_complete',
      [MpcMessageType.DKG_ERROR]: 'error',
      [MpcMessageType.SIGN_ROUND_1]: 'sign_r1_sent',
      [MpcMessageType.SIGN_ROUND_2]: 'sign_r2_sent',
      [MpcMessageType.SIGN_COMPLETE]: 'sign_complete',
      [MpcMessageType.SIGN_ERROR]: 'error',
      [MpcMessageType.ABORT]: 'aborted',
    };
    return map[type] ?? null;
  }

  private resetTimeout(sessionId: string): void {
    this.clearTimeout(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const timer = setTimeout(() => {
      const s = this.sessions.get(sessionId);
      if (s && !['dkg_complete', 'sign_complete', 'aborted'].includes(s.state)) {
        s.state = 'timed_out';
      }
    }, session.timeoutMs);

    this.timeouts.set(sessionId, timer);
  }

  private clearTimeout(sessionId: string): void {
    const timer = this.timeouts.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(sessionId);
    }
  }
}
