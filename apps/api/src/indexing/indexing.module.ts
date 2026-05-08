import { Module } from '@nestjs/common';
import { IndexingService } from './indexing.service';
import { IndexingController } from './indexing.controller';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [IndexingService],
  controllers: [IndexingController],
  exports: [IndexingService],
})
export class IndexingModule {}
