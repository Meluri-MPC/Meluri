import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VelumXClient } from '@velumx/sdk';

@Injectable()
export class RelayerService {
  private readonly logger = new Logger(RelayerService.name);
  private velumx: VelumXClient;

  constructor(private config: ConfigService) {
    const paymasterUrl = this.config.get<string>('VELUMX_RELAYER_URL', 'https://api.velumx.xyz/api/v1');
    const apiKey = this.config.get<string>('VELUMX_RELAYER_API_KEY');

    this.velumx = new VelumXClient({
      paymasterUrl,
      network: 'mainnet',
      ...(apiKey ? { apiKey } : {}),
    });
  }

  async sponsorTransaction(
    signedTxHex: string,
    options?: { userId?: string; network?: 'mainnet' | 'testnet' },
  ): Promise<{ txid: string; status: string }> {
    const result = await this.velumx.sponsor(signedTxHex, {
      userId: options?.userId,
      network: options?.network || 'mainnet',
    });

    this.logger.log(`Sponsored tx ${result.txid} via VelumX`);
    return result;
  }

  async estimateFee(params: { feeToken?: string; estimatedGas?: number }) {
    return this.velumx.estimateFee(params);
  }

  async getConfig() {
    return this.velumx.getConfig();
  }
}
