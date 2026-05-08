export class MpcWalletApi {
  constructor(private backendUrl: string, private apiKey: string) {}

  async register(wallet: { stxAddress: string; publicKey: string; userId: string; turnkeyWalletId: string; network: string }) {
    const res = await fetch(`${this.backendUrl}/wallets`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(wallet),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({ message: res.statusText })); throw new Error((err as any).message || 'Failed to register wallet'); }
    return res.json();
  }

  async findByUserId(userId: string) {
    const res = await fetch(`${this.backendUrl}/wallets/user/${userId}`, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch wallet');
    return res.json();
  }

  async getAssets(address: string) {
    const res = await fetch(`${this.backendUrl}/wallets/${address}/assets`, { headers: this.headers() });
    if (!res.ok) throw new Error('Failed to fetch assets');
    return res.json();
  }

  async getTransactions(address: string) {
    const res = await fetch(`${this.backendUrl}/wallets/${address}/transactions`, { headers: this.headers() });
    if (!res.ok) throw new Error('Failed to fetch transactions');
    return res.json();
  }

  async broadcast(txHex: string, senderAddress: string, network?: string, delegation?: string) {
    const body: Record<string, string> = { txHex, senderAddress, network: network || 'mainnet' };
    if (delegation) body.delegation = delegation;
    const res = await fetch(`${this.backendUrl}/tx/send`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(body),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({ message: res.statusText })); throw new Error((err as any).message || 'Broadcast failed'); }
    return res.json();
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'x-api-key': this.apiKey };
  }
}
