export type ChainId = 'stacks' | 'bitcoin' | 'ethereum' | 'solana' | 'sui' | 'aptos';

export interface ChainConfig {
  chainId: ChainId;
  rpcUrl: string;
  explorerUrl: string;
  nativeTokenSymbol: string;
  nativeTokenDecimals: number;
}

export interface ChainAdapter {
  readonly chainId: ChainId;
  readonly config: ChainConfig;

  buildTransfer(params: {
    from: string;
    to: string;
    amount: string;
    publicKey: string;
    network: string;
    fee?: string;
    nonce?: number;
  }): Promise<{ txHex: string }>;

  estimateFee(network: string): Promise<{
    low: string;
    medium: string;
    high: string;
  }>;

  decodeTransaction(txHex: string): {
    from: string;
    to?: string;
    amount?: string;
    method?: string;
  } | null;

  getExplorerTxUrl(txid: string, network: string): string;
  getExplorerAddressUrl(address: string, network: string): string;
}

export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  stacks: {
    chainId: 'stacks',
    rpcUrl: 'https://api.mainnet.hiro.so',
    explorerUrl: 'https://explorer.hiro.so',
    nativeTokenSymbol: 'STX',
    nativeTokenDecimals: 6,
  },
  bitcoin: {
    chainId: 'bitcoin',
    rpcUrl: 'https://bitcoin-mainnet.public.blastapi.io',
    explorerUrl: 'https://mempool.space',
    nativeTokenSymbol: 'BTC',
    nativeTokenDecimals: 8,
  },
  ethereum: {
    chainId: 'ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    nativeTokenSymbol: 'ETH',
    nativeTokenDecimals: 18,
  },
  solana: {
    chainId: 'solana',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    explorerUrl: 'https://solscan.io',
    nativeTokenSymbol: 'SOL',
    nativeTokenDecimals: 9,
  },
  sui: {
    chainId: 'sui',
    rpcUrl: 'https://fullnode.mainnet.sui.io',
    explorerUrl: 'https://suiscan.xyz',
    nativeTokenSymbol: 'SUI',
    nativeTokenDecimals: 9,
  },
  aptos: {
    chainId: 'aptos',
    rpcUrl: 'https://fullnode.mainnet.aptoslabs.com',
    explorerUrl: 'https://aptoscan.com',
    nativeTokenSymbol: 'APT',
    nativeTokenDecimals: 8,
  },
};

export function getChainConfig(chainId: ChainId): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) throw new Error(`Unsupported chain: ${chainId}`);
  return config;
}
