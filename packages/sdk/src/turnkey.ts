import { TurnkeyClient } from '@turnkey/http';
import { IframeStamper } from '@turnkey/iframe-stamper';

const TK_IFRAME_URL = 'https://auth.turnkey.com';
const IFRAME_ID = 'meluri-turnkey-iframe';

export class MpcTurnkey {
  private client: TurnkeyClient | null = null;
  private walletCache = new Map<string, { publicKey: string; walletId: string }>();
  private orgId: string | null = null;

  async getOrCreateWallet(userId: string): Promise<{ publicKey: string; walletId: string }> {
    const cached = this.walletCache.get(userId);
    if (cached) return cached;

    const client = await this.getClient();
    const orgId = await this.getOrgId();

    const walletsResult = await client.getWallets({ organizationId: orgId, parameters: {} } as any);
    const wallets = (walletsResult as any).wallets ?? [];
    const existing = wallets.find((w: any) => w.walletName === `user-${userId}`);

    if (existing?.addresses?.[0]) {
      const result = { publicKey: existing.addresses[0], walletId: existing.walletId };
      this.walletCache.set(userId, result);
      return result;
    }

    const createResult = await client.createWallet({
      type: 'ACTIVITY_TYPE_CREATE_WALLET',
      timestampMs: String(Date.now()),
      organizationId: orgId,
      parameters: {
        walletName: `user-${userId}`,
        accounts: [{ curve: 'CURVE_SECP256K1', pathFormat: 'PATH_FORMAT_BIP32', path: "m/44'/5757'/0'/0/0", addressFormat: 'ADDRESS_FORMAT_COMPRESSED' }],
      },
    } as any);

    const wr = (createResult as any).activity?.result?.createWalletResult;
    if (!wr?.walletId || !wr?.addresses?.[0]) throw new Error('Wallet creation failed');

    const result = { publicKey: wr.addresses[0], walletId: wr.walletId };
    this.walletCache.set(userId, result);
    return result;
  }

  async signRawPayload(walletId: string, payload: string): Promise<{ r: string; s: string; v: string }> {
    const client = await this.getClient();
    const orgId = await this.getOrgId();

    const result = await client.signRawPayload({
      type: 'ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2',
      timestampMs: String(Date.now()),
      organizationId: orgId,
      parameters: { signWith: walletId, payload, encoding: 'PAYLOAD_ENCODING_HEXADECIMAL', hashFunction: 'HASH_FUNCTION_SHA256' },
    } as any);

    const sig = (result as any).activity?.result?.signRawPayloadResult;
    if (!sig) throw new Error('Signing failed');
    return { r: sig.r ?? '', s: sig.s ?? '', v: sig.v ?? '' };
  }

  async signRawPayloads(walletId: string, payloads: string[]): Promise<Array<{ r: string; s: string; v: string }>> {
    const results = [];
    for (const payload of payloads) {
      results.push(await this.signRawPayload(walletId, payload));
    }
    return results;
  }

  private async getClient(): Promise<TurnkeyClient> {
    if (this.client) return this.client;

    let container = document.getElementById('meluri-turnkey-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'meluri-turnkey-container';
      container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
      document.body.appendChild(container);
    }

    const stamper = new IframeStamper({ iframeUrl: TK_IFRAME_URL, iframeElementId: IFRAME_ID, iframeContainer: container });
    await stamper.init();
    container.style.display = 'none';
    this.client = new TurnkeyClient({ baseUrl: 'https://api.turnkey.com' }, stamper);
    return this.client;
  }

  private async getOrgId(): Promise<string> {
    if (this.orgId) return this.orgId;
    const client = await this.getClient();
    const whoami = await client.getWhoami({ organizationId: '' } as any);
    this.orgId = whoami.organizationId;
    if (!this.orgId) throw new Error('Could not determine organization ID');
    return this.orgId;
  }
}
