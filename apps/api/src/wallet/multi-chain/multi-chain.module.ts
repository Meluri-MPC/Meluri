import { Module } from '@nestjs/common';
import { MultiChainService } from './multi-chain.service';
import { StacksChainAdapter } from './stacks.adapter';
import { RelayerModule } from '../../relayer/relayer.module';

@Module({
  imports: [RelayerModule],
  providers: [MultiChainService, StacksChainAdapter],
  exports: [MultiChainService, StacksChainAdapter],
})
export class MultiChainModule {}
