import { Module } from '@nestjs/common';
import { WalletTransactionController } from './transaction.controller';
import { TransactionBuilderService } from './transaction-builder.service';
import { WalletModule } from '../wallet.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RelayerModule } from '../../relayer/relayer.module';
import { IndexingModule } from '../../indexing/indexing.module';

@Module({
  imports: [WalletModule, PrismaModule, RelayerModule, IndexingModule],
  controllers: [WalletTransactionController],
  providers: [TransactionBuilderService],
  exports: [TransactionBuilderService],
})
export class WalletTransactionModule {}
