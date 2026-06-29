import { NativeConfig, NativeAuthProvider, NativeStorageInterface, NativeCryptoInterface } from './types';
import { NativeStorage } from './storage';
import { NativeCrypto } from './crypto';
import { NativeSession } from './session';
import { MPCWallet, AssetBalances, SendSTXParams, SendTokenParams, SendNFTParams, TransactionRecord, TokenBalance } from '../types';

export class VelumXMPCNative {
  private backendUrl: string;
  private auth: NativeAuthProvider;
  private storage: NativeStorageInterface;
  private crypto: NativeCryptoInterface;
  private session: NativeSession | null = null;
  private walletCache: MPCWallet | null = null;
  private apiKey: string;
  private network: string;

  constructor(config: NativeConfig) {
    this.backendUrl = config.backendUrl || 'https://api.velumx.xyz/api/v1';
    this.auth = config.auth;
    this.apiKey = config.apiKey;
    this.network = config.network || 'mainnet';
    this.storage = config.storage || new NativeStorage();
    this.crypto = config.crypto || new NativeCrypto();
  }

  async login(): Promise<MPCWallet> {
    const s = await this.auth.login();
    return this.getOrCreateWallet(s.userId);
  }

  async logout(): Promise<void> {
    await this.session?.clearSession();
    this.walletCache = null;
    await this.auth.logout();
  }

  async getWallet(): Promise<MPCWallet> {
    if (this.walletCache) return this.walletCache;
    const s = await this.auth.getSession();
    if (!s) throw new Error('Not authenticated. Call login() first.');
    return this.getOrCreateWallet(s.userId);
  }

  async getBalance(): Promise<{ stx: string; tokens: Array<{ symbol: string; balance: string }> }> {
    const w = await this.getWallet();
    const assets = await this.fetchJson<AssetBalances>(`${this.backendUrl}/wallets/${w.stxAddress}/assets`);
    return {
      stx: assets.stx ? fmtBal(assets.stx.balance, assets.stx.decimals) : '0',
      tokens: assets.tokens.map((t: TokenBalance) => ({ symbol: t.symbol, balance: fmtBal(t.balance, t.decimals) })),
    };
  }

  async getTransactionHistory(): Promise<TransactionRecord[]> {
    const w = await this.getWallet();
    const result = await this.fetchJson<{ transactions: TransactionRecord[] }>(
      `${this.backendUrl}/wallets/${w.stxAddress}/transactions`
    );
    return result.transactions;
  }

  async sendSTX(params: SendSTXParams): Promise<{ txid: string }> {
    const w = await this.getWallet();
    return this.fetchJson(`${this.backendUrl}/tx/send`, {
      method: 'POST',
      body: JSON.stringify({ ...params, senderAddress: w.stxAddress, network: this.network }),
    });
  }

  async sendToken(params: SendTokenParams): Promise<{ txid: string }> {
    const w = await this.getWallet();
    return this.fetchJson(`${this.backendUrl}/tx/send`, {
      method: 'POST',
      body: JSON.stringify({ ...params, senderAddress: w.stxAddress, network: this.network, type: 'token' }),
    });
  }

  async sendNFT(params: SendNFTParams): Promise<{ txid: string }> {
    const w = await this.getWallet();
    return this.fetchJson(`${this.backendUrl}/tx/send`, {
      method: 'POST',
      body: JSON.stringify({ ...params, senderAddress: w.stxAddress, network: this.network, type: 'nft' }),
    });
  }

  private async getOrCreateWallet(userId: string): Promise<MPCWallet> {
    const existing = await this.findWalletByUserId(userId);
    if (existing) { this.walletCache = existing; return existing; }

    const wallet = await this.fetchJson<MPCWallet>(`${this.backendUrl}/wallets`, {
      method: 'POST',
      body: JSON.stringify({ userId, network: this.network }),
    });

    this.walletCache = wallet;
    return wallet;
  }

  private async findWalletByUserId(userId: string): Promise<MPCWallet | null> {
    const res = await this.fetch(`${this.backendUrl}/wallets/user/${userId}`, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch wallet');
    return res.json();
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.fetch(url, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers as Record<string, string> || {}) },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error((err as any).message || 'Request failed');
    }
    return res.json();
  }

  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    return fetch(url, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers as Record<string, string> || {}) },
    });
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'x-api-key': this.apiKey };
  }
}

function fmtBal(raw: string, dec: number): string {
  const bn = BigInt(raw), d = BigInt(10) ** BigInt(dec), intP = bn / d, fracP = bn % d;
  const fs = fracP.toString().padStart(dec, '0').replace(/0+$/, '');
  return fs ? `${intP}.${fs}` : intP.toString();
}
