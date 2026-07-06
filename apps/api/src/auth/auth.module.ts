import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwksController } from './jwks.controller';
import { AuthService } from './auth.service';
import { TurnkeyModule } from '../turnkey/turnkey.module';
import { MpcModule } from '../mpc/mpc.module';

@Module({
  imports: [TurnkeyModule, MpcModule],
  controllers: [AuthController, JwksController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
