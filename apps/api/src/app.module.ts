import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TurnkeyModule } from './turnkey/turnkey.module';
import { WalletModule } from './wallet/wallet.module';
import { IndexingModule } from './indexing/indexing.module';
import { TransactionModule } from './transaction/transaction.module';
import { RelayerModule } from './relayer/relayer.module';
import { SessionModule } from './session/session.module';
import { SimpleWalletModule } from './simple-wallet/simple-wallet.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
    PrismaModule,
    AuthModule,
    TurnkeyModule,
    WalletModule,
    IndexingModule,
    TransactionModule,
    RelayerModule,
    SessionModule,
    SimpleWalletModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
