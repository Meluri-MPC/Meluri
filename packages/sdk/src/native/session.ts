import { NativeStorageInterface, NativeCryptoInterface } from './types';
import { NativeStorage } from './storage';
import { NativeCrypto } from './crypto';
import { getPublicKey } from '@noble/secp256k1';
import { SessionKey } from '../types';

const STORAGE_KEY = 'velumx_mpc_session';
const DEFAULT_DURATION = 30 * 60 * 1000;

export class NativeSession {
  private activeSession: SessionKey | null = null;
  private storage: NativeStorageInterface;
  private crypto: NativeCryptoInterface;

  constructor(
    private turnkeySigner: (walletId: string, payload: string) => Promise<{ r: string; s: string; v: string }>,
    storage?: NativeStorageInterface,
    crypto?: NativeCryptoInterface,
  ) {
    this.storage = storage || new NativeStorage();
    this.crypto = crypto || new NativeCrypto();
  }

  async createSession(
    walletPubKey: string,
    walletAddr: string,
    tkWalletId: string,
    durMs?: number,
  ): Promise<SessionKey> {
    const privBytes = this.crypto.randomBytes(32);
    const privateKey = Buffer.from(privBytes).toString('hex');
    const publicKey = Buffer.from(getPublicKey(privBytes, true)).toString('hex');
    const expiresAt = Date.now() + (durMs || DEFAULT_DURATION);
    const nonce = Buffer.from(this.crypto.randomBytes(16)).toString('hex');

    const msg = JSON.stringify({
      action: 'velumx-mpc-session-delegation',
      sessionPublicKey: publicKey,
      walletPublicKey: walletPubKey,
      walletAddress: walletAddr,
      expiresAt,
      nonce,
    });

    const msgHashUint8 = this.crypto.sha256(new TextEncoder().encode(msg));
    const msgHash = Buffer.from(msgHashUint8).toString('hex');
    const sig = await this.turnkeySigner(tkWalletId, msgHash);

    const session: SessionKey = {
      privateKey,
      publicKey,
      delegation: {
        sessionPublicKey: publicKey,
        walletPublicKey: walletPubKey,
        walletAddress: walletAddr,
        expiresAt,
        nonce,
        signature: sig,
      },
    };

    this.activeSession = session;
    await this.storage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  }

  async getActiveSession(): Promise<SessionKey | null> {
    if (this.activeSession && !this.isExpired(this.activeSession)) return this.activeSession;

    try {
      const raw = await this.storage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SessionKey;
        if (!this.isExpired(s)) {
          this.activeSession = s;
          return s;
        }
      }
    } catch {}

    await this.clearSession();
    return null;
  }

  isExpired(s: SessionKey): boolean {
    return Date.now() > s.delegation.expiresAt;
  }

  getRemainingTime(s: SessionKey): number {
    return Math.max(0, s.delegation.expiresAt - Date.now());
  }

  async clearSession(): Promise<void> {
    this.activeSession = null;
    await this.storage.removeItem(STORAGE_KEY);
  }
}
