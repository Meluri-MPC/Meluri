import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { WalletModule } from '../wallet/wallet.module';
import { RelayerModule } from '../relayer/relayer.module';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [WalletModule, RelayerModule, SessionModule],
  controllers: [TransactionController],
  providers: [TransactionService],
})
export class TransactionModule {}
