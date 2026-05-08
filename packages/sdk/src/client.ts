import { MeluriMPCConfig, MPCWallet, AssetBalances, SendSTXParams, SendTokenParams, SendNFTParams, TransactionRecord, TokenBalance } from './types';
import { MpcAuth } from './auth';
import { MpcTurnkey } from './turnkey';
import { MpcWalletApi } from './wallet';
import { MpcSigning } from './signing';
import { MpcSession } from './session';
import { publicKeyToAddress } from '@stacks/transactions';

export class MeluriMPC {
  private backendUrl: string;
  private auth: MpcAuth;
  private turnkey: MpcTurnkey;
  private wallet: MpcWalletApi;
  private signing: MpcSigning;
  private session: MpcSession;
  private walletCache: MPCWallet | null = null;

  constructor(private config: MeluriMPCConfig) {
    this.backendUrl = config.backendUrl || 'https://api.meluri.xyz/api/v1';
    this.auth = new MpcAuth(config.clerkPublishableKey);
    this.turnkey = new MpcTurnkey();
    this.session = new MpcSession(this.turnkey);
    this.wallet = new MpcWalletApi(this.backendUrl, config.apiKey);
    this.signing = new MpcSigning(this.turnkey, this.session);
  }

  async login(): Promise<MPCWallet> {
    const s = await this.auth.login();
    return this.getOrCreateWallet(s.userId);
  }

  async logout(): Promise<void> { this.session.clearSession(); this.walletCache = null; await this.auth.logout(); }

  async getWallet(): Promise<MPCWallet> {
    if (this.walletCache) return this.walletCache;
    const s = await this.auth.getSession();
    if (!s) throw new Error('Not authenticated. Call login() first.');
    return this.getOrCreateWallet(s.userId);
  }

  async createSession(durMinutes?: number): Promise<{ expiresAt: number; remainingMinutes: number }> {
    const wallet = await this.getWallet();
    const sk = await this.session.createSession(wallet.publicKey, wallet.stxAddress, wallet.turnkeyWalletId ?? '', (durMinutes || 30) * 60000);
    return { expiresAt: sk.delegation.expiresAt, remainingMinutes: Math.floor(this.session.getRemainingTime(sk) / 60000) };
  }

  getSessionStatus() {
    const active = this.session.getActiveSession();
    return active ? { active: true, remainingMinutes: Math.floor(this.session.getRemainingTime(active) / 60000) } : null;
  }

  async getBalance(): Promise<{ stx: string; tokens: Array<{ symbol: string; balance: string }> }> {
    const w = await this.getWallet();
    const a = await this.wallet.getAssets(w.stxAddress);
    return { stx: a.stx ? fmtBal(a.stx.balance, a.stx.decimals) : '0', tokens: a.tokens.map((t: TokenBalance) => ({ symbol: t.symbol, balance: fmtBal(t.balance, t.decimals) })) };
  }

  async getAssets(): Promise<AssetBalances> { return this.wallet.getAssets((await this.getWallet()).stxAddress); }
  async getTransactionHistory(): Promise<TransactionRecord[]> { return (await this.wallet.getTransactions((await this.getWallet()).stxAddress)).transactions; }

  async sendSTX(p: SendSTXParams) {
    const w = await this.getWallet();
    const { txHex, usedSessionKey, delegation } = await this.signing.buildAndSignSTXTransfer({ ...p, publicKey: w.publicKey, network: this.config.network || 'mainnet', turnkeyWalletId: w.turnkeyWalletId ?? '' });
    const r = await this.wallet.broadcast(txHex, w.stxAddress, this.config.network, delegation);
    return { txid: r.txid, usedSessionKey };
  }

  async sendToken(p: SendTokenParams) {
    const w = await this.getWallet();
    const { txHex, usedSessionKey, delegation } = await this.signing.buildAndSignTokenTransfer({ ...p, publicKey: w.publicKey, network: this.config.network || 'mainnet', turnkeyWalletId: w.turnkeyWalletId ?? '' });
    const r = await this.wallet.broadcast(txHex, w.stxAddress, this.config.network, delegation);
    return { txid: r.txid, usedSessionKey };
  }

  async sendNFT(p: SendNFTParams) {
    const w = await this.getWallet();
    const { txHex, usedSessionKey, delegation } = await this.signing.buildAndSignNFTTransfer({ ...p, publicKey: w.publicKey, network: this.config.network || 'mainnet', turnkeyWalletId: w.turnkeyWalletId ?? '' });
    const r = await this.wallet.broadcast(txHex, w.stxAddress, this.config.network, delegation);
    return { txid: r.txid, usedSessionKey };
  }

  async batchSend(txs: Array<{ type: 'stx'; params: SendSTXParams } | { type: 'token'; params: SendTokenParams } | { type: 'nft'; params: SendNFTParams }>) {
    const w = await this.getWallet();
    const results = await Promise.all(txs.map(async (tx) => {
      if (tx.type === 'stx') return this.sendSTX(tx.params);
      if (tx.type === 'token') return this.sendToken(tx.params);
      return this.sendNFT(tx.params);
    }));
    return Promise.all(results);
  }

  private async getOrCreateWallet(userId: string): Promise<MPCWallet> {
    const existing = await this.wallet.findByUserId(userId);
    if (existing) { this.walletCache = existing; return existing; }

    const { publicKey, walletId } = await this.turnkey.getOrCreateWallet(userId);
    const stxAddress = publicKeyToAddress(publicKey, this.config.network === 'testnet' ? 'testnet' : 'mainnet');

    const wallet = await this.wallet.register({ stxAddress, publicKey, userId, turnkeyWalletId: walletId, network: this.config.network || 'mainnet' });
    this.walletCache = wallet;
    return wallet;
  }
}

function fmtBal(raw: string, dec: number): string {
  const bn = BigInt(raw), d = BigInt(10) ** BigInt(dec), intP = bn / d, fracP = bn % d;
  const fs = fracP.toString().padStart(dec, '0').replace(/0+$/, '');
  return fs ? `${intP}.${fs}` : intP.toString();
}
