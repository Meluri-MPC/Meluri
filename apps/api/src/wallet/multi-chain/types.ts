export interface ChainAdapter {
  readonly chain: string;
  buildTransfer(wallet: any, params: { to: string; amount: string; memo?: string }): Promise<{ txHex: string }>;
  estimateFee(wallet: any): Promise<{ low: number; medium: number; high: number }>;
  broadcast(txHex: string, network: string): Promise<{ txid: string; status: string }>;
  deriveAddress(publicKey: string, network: string): string;
}

export interface MultiChainConfig {
  rpcUrl?: string;
  explorerUrl?: string;
  tokenDecimals?: number;
}
