import { Injectable, Logger } from '@nestjs/common';
import { DkgCoordinator } from '../tss/dkg';

@Injectable()
export class MpcDkgService {
  private readonly logger = new Logger(MpcDkgService.name);

  async runDkg(walletId: string, tenantId: string): Promise<{
    walletId: string;
    publicKey: string;
    shares: Array<{ partyId: number; share: string }>;
  }> {
    const coordinator = new DkgCoordinator(walletId);
    const result = coordinator.runFullDkg();

    this.logger.log(
      `DKG completed: walletId=${walletId}, publicKey=${Buffer.from(result.publicKey).toString('hex').slice(0, 16)}...`,
    );

    return {
      walletId,
      publicKey: Buffer.from(result.publicKey).toString('hex'),
      shares: Array.from(result.shares.entries()).map(([partyId, share]) => ({
        partyId,
        share: share.toString(),
      })),
    };
  }
}
