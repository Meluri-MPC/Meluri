import { Module } from '@nestjs/common';
import { MpcSigningService } from './grpc/signing.service';
import { SigningGrpcController } from './grpc/grpc.controller';
import { SigningController } from './signing.controller';

@Module({
  controllers: [SigningGrpcController, SigningController],
  providers: [MpcSigningService],
  exports: [MpcSigningService],
})
export class SigningModule {}
