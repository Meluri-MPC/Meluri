import { Injectable, Logger } from '@nestjs/common';
import { RelayerService } from '../relayer/relayer.service';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private relayer: RelayerService) {}

  async sponsor(
    txHex: string,
    userId: string,
    network: string,
  ): Promise<{ txid: string; status: string }> {
    return this.relayer.sponsorTransaction(txHex, { network: network as any });
  }
}
