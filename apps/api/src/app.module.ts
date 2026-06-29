import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TurnkeyModule } from './turnkey/turnkey.module';
import { WalletModule } from './wallet/wallet.module';
import { WalletTransactionModule } from './wallet/transactions/transaction.module';
import { MultiChainModule } from './wallet/multi-chain/multi-chain.module';
import { TransactionHistoryModule } from './wallet/history/history.module';
import { IndexingModule } from './indexing/indexing.module';
import { TransactionModule } from './transaction/transaction.module';
import { RelayerModule } from './relayer/relayer.module';
import { SessionModule } from './session/session.module';
import { SimpleWalletModule } from './simple-wallet/simple-wallet.module';
import { OAuthModule } from './oauth/oauth.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
    PrismaModule,
    AuthModule,
    TurnkeyModule,
    WalletModule,
    WalletTransactionModule,
    MultiChainModule,
    TransactionHistoryModule,
    IndexingModule,
    TransactionModule,
    RelayerModule,
    SessionModule,
    SimpleWalletModule,
    OAuthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
