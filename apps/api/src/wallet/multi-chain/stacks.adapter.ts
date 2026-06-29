import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RelayerService } from '../../relayer/relayer.service';
import { ChainAdapter } from './types';
import {
  makeUnsignedSTXTokenTransfer,
  publicKeyToAddress,
} from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';

@Injectable()
export class StacksChainAdapter implements ChainAdapter {
  readonly chain = 'stacks';
  private readonly logger = new Logger(StacksChainAdapter.name);

  constructor(
    private config: ConfigService,
    private relayer: RelayerService,
  ) {}

  async buildTransfer(
    wallet: any,
    params: { to: string; amount: string; memo?: string },
  ): Promise<{ txHex: string }> {
    const network = wallet.network === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;

    const tx = await makeUnsignedSTXTokenTransfer({
      recipient: params.to,
      amount: BigInt(params.amount),
      memo: params.memo ?? '',
      publicKey: wallet.publicKey,
      network: network as any,
      fee: 0n,
    });

    return { txHex: Buffer.from(tx.serialize()).toString('hex') };
  }

  async estimateFee(
    _wallet: any,
  ): Promise<{ low: number; medium: number; high: number }> {
    return { low: 1000, medium: 5000, high: 10000 };
  }

  async broadcast(
    txHex: string,
    network: string,
  ): Promise<{ txid: string; status: string }> {
    return this.relayer.sponsorTransaction(txHex, { network: network as any });
  }

  deriveAddress(publicKey: string, network: string): string {
    return publicKeyToAddress(publicKey, network === 'mainnet' ? 'mainnet' : 'testnet');
  }
}
