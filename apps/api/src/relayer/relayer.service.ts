import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface BroadcastResult {
  txid: string;
  status: string;
  sponsored: boolean;
}

export interface FeeEstimate {
  low: number;
  medium: number;
  high: number;
}

@Injectable()
export class RelayerService implements OnModuleInit {
  private readonly logger = new Logger(RelayerService.name);
  private readonly relayerUrl: string;
  private readonly relayerApiKey: string | undefined;
  private readonly hiroBase: string;
  private readonly hiroApiKey: string | undefined;
  private readonly defaultNetwork: 'mainnet' | 'testnet';

  constructor(private readonly config: ConfigService) {
    this.relayerUrl = this.config.get<string>('VELUMX_RELAYER_URL', 'https://api.velumx.xyz/api/v1');
    this.relayerApiKey = this.config.get<string>('VELUMX_RELAYER_API_KEY');
    this.hiroBase = this.config.get<string>('HIRO_API_URL', 'https://api.mainnet.hiro.so');
    this.hiroApiKey = this.config.get<string>('HIRO_API_KEY');
    this.defaultNetwork = this.config.get<string>('VELUMX_NETWORK', 'testnet') as 'mainnet' | 'testnet';
  }

  onModuleInit(): void {
    if (!this.relayerApiKey) {
      this.logger.warn(
        'VELUMX_RELAYER_API_KEY not set — fee sponsorship will be unavailable. ' +
        'Transactions will be broadcast directly to Hiro (user pays fees).',
      );
    }
  }

  /**
   * Route a signed transaction based on the developer's sponsorship configuration.
   *
   * - `sponsorFees = true` → POST to VelumX relayer (developer pays fees for users)
   * - `sponsorFees = false` → broadcast directly to Hiro (user pays their own fee)
   *
   * If the developer provides a custom `relayerUrl` it overrides the platform default.
   */
  async broadcast(
    signedTxHex: string,
    options: {
      network?: 'mainnet' | 'testnet';
      /** Whether this org has opted in to fee sponsorship */
      sponsorFees: boolean;
      /** Optional per-org relayer URL override */
      relayerUrl?: string | null;
    },
  ): Promise<BroadcastResult> {
    const net = options.network ?? this.defaultNetwork;

    if (options.sponsorFees && this.relayerApiKey) {
      try {
        const result = await this.postToRelayer(signedTxHex, net, options.relayerUrl ?? undefined);
        this.logger.log(`Sponsored tx ${result.txid} via relayer (${net})`);
        return { ...result, sponsored: true };
      } catch (err: any) {
        this.logger.warn(
          `Relayer sponsorship failed for (${net}), falling back to direct broadcast: ${err.message}`,
        );
      }
    }

    // Direct broadcast — end-user pays the fee included in the signed tx
    const result = await this.broadcastToHiro(signedTxHex, net);
    this.logger.log(`Broadcast tx ${result.txid} directly to Hiro (${net})`);
    return { ...result, sponsored: false };
  }

  /**
   * Estimate the current STX transfer fee from Hiro.
   */
  async estimateFee(network?: 'mainnet' | 'testnet'): Promise<FeeEstimate> {
    const net = network ?? this.defaultNetwork;
    const base = net === 'mainnet' ? 'https://api.mainnet.hiro.so' : 'https://api.testnet.hiro.so';
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this.hiroApiKey) headers['x-api-key'] = this.hiroApiKey;
      const res = await fetch(`${base}/v2/fees/transfer`, { headers });
      if (res.ok) {
        const raw = parseInt(await res.text(), 10);
        if (!isNaN(raw) && raw > 0) {
          return { low: Math.max(180, raw - 500), medium: raw, high: raw + 1000 };
        }
      }
    } catch {}
    return { low: 500, medium: 2000, high: 5000 };
  }

  // ─── Transport helpers ────────────────────────────────────────────────────

  private async postToRelayer(
    signedTxHex: string,
    network: 'mainnet' | 'testnet',
    relayerUrlOverride?: string,
  ): Promise<{ txid: string; status: string }> {
    const url = relayerUrlOverride ?? this.relayerUrl;
    const response = await fetch(`${url}/sponsor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.relayerApiKey!,
      },
      body: JSON.stringify({ txHex: signedTxHex, network }),
    });

    if (!response.ok) {
      throw new Error(`Relayer error ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  private async broadcastToHiro(
    signedTxHex: string,
    network: 'mainnet' | 'testnet',
  ): Promise<{ txid: string; status: string }> {
    const base =
      network === 'mainnet'
        ? 'https://api.mainnet.hiro.so'
        : 'https://api.testnet.hiro.so';

    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };
    if (this.hiroApiKey) headers['x-api-key'] = this.hiroApiKey;

    const response = await fetch(`${base}/v2/transactions`, {
      method: 'POST',
      headers,
      body: Buffer.from(signedTxHex, 'hex'),
    });

    if (!response.ok) {
      throw new Error(`Hiro broadcast error ${response.status}: ${await response.text()}`);
    }

    const txid: string = await response.json();
    return { txid, status: 'pending' };
  }
}
