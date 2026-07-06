import { Module } from '@nestjs/common';
import { MpcDkgController } from './dkg.controller';
import { MpcDkgService } from './dkg.service';

@Module({
  controllers: [MpcDkgController],
  providers: [MpcDkgService],
  exports: [MpcDkgService],
})
export class MpcDkgModule {}
