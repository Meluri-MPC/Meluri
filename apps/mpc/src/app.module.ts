import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { SigningModule } from './signing.module';
import { MpcDkgModule } from './dkg/dkg.module';
import { MetricsModule } from './metrics/metrics.module';
import { TransportModule } from './transport/transport.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
    TransportModule.forRoot(),
    MpcDkgModule,
    SigningModule,
    MetricsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
