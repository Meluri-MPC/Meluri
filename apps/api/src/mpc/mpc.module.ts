import { Module } from '@nestjs/common';
import { MpcClientService } from './mpc-client.service';
import { MpcProvisionService } from './mpc-provision.service';

@Module({
  providers: [MpcClientService, MpcProvisionService],
  exports: [MpcClientService, MpcProvisionService],
})
export class MpcModule {}
