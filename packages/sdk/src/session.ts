import * as crypto from 'crypto';
import { getPublicKey } from '@noble/secp256k1';
import { SessionKey, SessionDelegation } from './types';
import { MpcTurnkey } from './turnkey';

const STORAGE_KEY = 'meluri_mpc_session';
const DEFAULT_DURATION = 30 * 60 * 1000;

export class MpcSession {
  private activeSession: SessionKey | null = null;

  constructor(private turnkey: MpcTurnkey) {}

  async createSession(walletPubKey: string, walletAddr: string, tkWalletId: string, durMs?: number): Promise<SessionKey> {
    const privBytes = crypto.randomBytes(32);
    const privateKey = privBytes.toString('hex');
    const publicKey = Buffer.from(getPublicKey(privBytes, true)).toString('hex');
    const expiresAt = Date.now() + (durMs || DEFAULT_DURATION);
    const nonce = crypto.randomBytes(16).toString('hex');

    const msg = JSON.stringify({ action: 'meluri-mpc-session-delegation', sessionPublicKey: publicKey, walletPublicKey: walletPubKey, walletAddress: walletAddr, expiresAt, nonce });
    const msgHash = crypto.createHash('sha256').update(msg).digest('hex');
    const sig = await this.turnkey.signRawPayload(tkWalletId, msgHash);

    const session: SessionKey = { privateKey, publicKey, delegation: { sessionPublicKey: publicKey, walletPublicKey: walletPubKey, walletAddress: walletAddr, expiresAt, nonce, signature: sig } };
    this.activeSession = session;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch {}
    return session;
  }

  getActiveSession(): SessionKey | null {
    if (this.activeSession && !this.isExpired(this.activeSession)) return this.activeSession;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SessionKey;
        if (!this.isExpired(s)) { this.activeSession = s; return s; }
      }
    } catch {}
    this.clearSession();
    return null;
  }

  isExpired(s: SessionKey): boolean { return Date.now() > s.delegation.expiresAt; }

  getRemainingTime(s: SessionKey): number { return Math.max(0, s.delegation.expiresAt - Date.now()); }

  clearSession(): void {
    this.activeSession = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}
