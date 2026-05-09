import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RelayerService {
  private readonly logger = new Logger(RelayerService.name);
  private relayerUrl: string;
  private apiKey: string;

  constructor(private config: ConfigService) {
    this.relayerUrl = this.config.get<string>('VELUMX_RELAYER_URL', 'https://api.velumx.xyz/api/v1');
    this.apiKey = this.config.get<string>('VELUMX_RELAYER_API_KEY', '');
  }

  async sponsorTransaction(
    signedTxHex: string,
    options?: { userId?: string; network?: 'mainnet' | 'testnet' },
  ): Promise<{ txid: string; status: string }> {
    const body: Record<string, string> = { txHex: signedTxHex };
    if (options?.userId) body.userId = options.userId;
    if (options?.network) body.network = options.network;

    const response = await fetch(`${this.relayerUrl}/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`VelumX: ${err.error || err.message || response.statusText}`);
    }

    const result = await response.json();
    this.logger.log(`Sponsored tx ${result.txid} via VelumX`);
    return result;
  }

  async estimateFee(params: { feeToken?: string; estimatedGas?: number; network?: 'mainnet' | 'testnet' }) {
    return this.estimate(params);
  }

  private async estimate(params: { feeToken?: string; estimatedGas?: number; network?: 'mainnet' | 'testnet' }): Promise<any> {
    const response = await fetch(`${this.relayerUrl}/estimate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
      },
      body: JSON.stringify({
        intent: {
          feeToken: params.feeToken,
          estimatedGas: params.estimatedGas ?? 150000,
          network: params.network ?? 'testnet',
        },
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`VelumX estimate: ${err.error || err.message || response.statusText}`);
    }
    return response.json();
  }
}
