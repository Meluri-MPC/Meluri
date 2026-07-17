import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwksController } from './jwks.controller';
import { AuthService } from './auth.service';
import { MpcModule } from '../mpc/mpc.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, MpcModule],
  controllers: [AuthController, JwksController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
