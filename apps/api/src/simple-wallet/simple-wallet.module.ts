import { Module } from '@nestjs/common';
import { SimpleWalletController } from './simple-wallet.controller';
import { SimpleWalletService } from './simple-wallet.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RelayerModule } from '../relayer/relayer.module';

@Module({
  imports: [PrismaModule, RelayerModule],
  controllers: [SimpleWalletController],
  providers: [SimpleWalletService],
  exports: [SimpleWalletService],
})
export class SimpleWalletModule {}
