import { Injectable, Logger } from '@nestjs/common';
import { RelayerService } from '../relayer/relayer.service';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private readonly relayer: RelayerService) {}

  async send(
    txHex: string,
    network: 'mainnet' | 'testnet',
    sponsorFees: boolean,
    relayerUrl?: string | null,
  ) {
    return this.relayer.broadcast(txHex, { network, sponsorFees, relayerUrl });
  }
}
