import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { WalletTransactionModule } from './wallet/transactions/transaction.module';
import { MultiChainModule } from './wallet/multi-chain/multi-chain.module';
import { TransactionHistoryModule } from './wallet/history/history.module';
import { IndexingModule } from './indexing/indexing.module';
import { TransactionModule } from './transaction/transaction.module';
import { RelayerModule } from './relayer/relayer.module';
import { SessionModule } from './session/session.module';
import { OAuthModule } from './oauth/oauth.module';
import { TokenModule } from './token/token.module';
import { MpcModule } from './mpc/mpc.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: parseInt(config.get('RATE_LIMIT_TTL', '60'), 10) * 1000,
          limit: parseInt(config.get('RATE_LIMIT_MAX', '100'), 10),
        },
      ],
    }),
    TokenModule,
    PrismaModule,
    AuthModule,
    MpcModule,
    WalletModule,
    WalletTransactionModule,
    MultiChainModule,
    TransactionHistoryModule,
    IndexingModule,
    TransactionModule,
    RelayerModule,
    SessionModule,
    OAuthModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
