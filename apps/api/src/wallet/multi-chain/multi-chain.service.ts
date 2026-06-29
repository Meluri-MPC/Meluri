import { Injectable } from '@nestjs/common';
import { ChainAdapter } from './types';
import { StacksChainAdapter } from './stacks.adapter';

@Injectable()
export class MultiChainService {
  private adapters: Map<string, ChainAdapter> = new Map();

  constructor(private stacksAdapter: StacksChainAdapter) {
    this.registerAdapter(stacksAdapter);
  }

  registerAdapter(adapter: ChainAdapter): void {
    this.adapters.set(adapter.chain, adapter);
  }

  getAdapter(chain: string): ChainAdapter {
    const adapter = this.adapters.get(chain);
    if (!adapter) throw new Error(`No adapter registered for chain: ${chain}`);
    return adapter;
  }

  getSupportedChains(): string[] {
    return Array.from(this.adapters.keys());
  }
}
