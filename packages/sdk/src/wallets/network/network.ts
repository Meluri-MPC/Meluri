import type { ChainType, StacksNetwork, BitcoinNetwork, EthereumNetwork, SolanaNetwork, SuiNetwork, AptosNetwork, ChainNetwork } from '../types';
import type { WalletProvider } from '../types';

export interface NetworkInfo {
  chain: ChainType;
  network: string;
  isMainnet: boolean;
  isTestnet: boolean;
}

export interface NetworkSwitchResult {
  success: boolean;
  from: string;
  to: string;
  message?: string;
  fallbackUsed: boolean;
}

const STACKS_NETWORKS: Record<string, { name: string; isMainnet: boolean; isTestnet: boolean }> = {
  mainnet: { name: 'mainnet', isMainnet: true, isTestnet: false },
  testnet: { name: 'testnet', isMainnet: false, isTestnet: true },
  devnet: { name: 'devnet', isMainnet: false, isTestnet: true },
  mocknet: { name: 'mocknet', isMainnet: false, isTestnet: true },
};

const BITCOIN_NETWORKS: Record<string, { name: string; isMainnet: boolean; isTestnet: boolean }> = {
  mainnet: { name: 'mainnet', isMainnet: true, isTestnet: false },
  testnet: { name: 'testnet', isMainnet: false, isTestnet: true },
  regtest: { name: 'regtest', isMainnet: false, isTestnet: true },
  signet: { name: 'signet', isMainnet: false, isTestnet: true },
};

const ETHEREUM_NETWORKS: Record<string, { name: string; isMainnet: boolean; isTestnet: boolean }> = {
  mainnet: { name: 'mainnet', isMainnet: true, isTestnet: false },
  goerli: { name: 'goerli', isMainnet: false, isTestnet: true },
  sepolia: { name: 'sepolia', isMainnet: false, isTestnet: true },
  holesky: { name: 'holesky', isMainnet: false, isTestnet: true },
};

const SOLANA_NETWORKS: Record<string, { name: string; isMainnet: boolean; isTestnet: boolean }> = {
  'mainnet-beta': { name: 'mainnet-beta', isMainnet: true, isTestnet: false },
  testnet: { name: 'testnet', isMainnet: false, isTestnet: true },
  devnet: { name: 'devnet', isMainnet: false, isTestnet: true },
  localnet: { name: 'localnet', isMainnet: false, isTestnet: true },
};

const SUI_NETWORKS: Record<string, { name: string; isMainnet: boolean; isTestnet: boolean }> = {
  mainnet: { name: 'mainnet', isMainnet: true, isTestnet: false },
  testnet: { name: 'testnet', isMainnet: false, isTestnet: true },
  devnet: { name: 'devnet', isMainnet: false, isTestnet: true },
  localnet: { name: 'localnet', isMainnet: false, isTestnet: true },
};

const APTOS_NETWORKS: Record<string, { name: string; isMainnet: boolean; isTestnet: boolean }> = {
  mainnet: { name: 'mainnet', isMainnet: true, isTestnet: false },
  testnet: { name: 'testnet', isMainnet: false, isTestnet: true },
  devnet: { name: 'devnet', isMainnet: false, isTestnet: true },
};

function getNetworkMap(chain: ChainType): Record<string, { name: string; isMainnet: boolean; isTestnet: boolean }> {
  switch (chain) {
    case 'stacks': return STACKS_NETWORKS;
    case 'bitcoin': return BITCOIN_NETWORKS;
    case 'ethereum': return ETHEREUM_NETWORKS;
    case 'solana': return SOLANA_NETWORKS;
    case 'sui': return SUI_NETWORKS;
    case 'aptos': return APTOS_NETWORKS;
  }
}

export function parseNetwork(raw: string, chain: ChainType): NetworkInfo {
  const normalized = raw.toLowerCase().trim();
  const map = getNetworkMap(chain);
  const entry = map[normalized];

  if (entry) {
    return {
      chain,
      network: entry.name,
      isMainnet: entry.isMainnet,
      isTestnet: entry.isTestnet,
    };
  }

  const isMainnet = normalized.includes('mainnet') || normalized === 'main';
  const isTestnet = normalized.includes('test') || normalized.includes('dev');

  return {
    chain,
    network: normalized,
    isMainnet,
    isTestnet,
  };
}

export async function detectNetwork(provider: WalletProvider, chain?: ChainType): Promise<NetworkInfo> {
  const raw = await provider.getNetwork();
  return parseNetwork(raw, chain || 'stacks');
}

export async function switchNetwork(
  provider: WalletProvider,
  targetNetwork: string,
  chain?: ChainType
): Promise<NetworkSwitchResult> {
  const currentInfo = await detectNetwork(provider, chain);
  const currentNetwork = currentInfo.network;

  if (currentNetwork === targetNetwork) {
    return { success: true, from: currentNetwork, to: targetNetwork, fallbackUsed: false };
  }

  if (provider.switchNetwork) {
    try {
      await provider.switchNetwork(targetNetwork);
      return { success: true, from: currentNetwork, to: targetNetwork, fallbackUsed: false };
    } catch (e) {
      return {
        success: false,
        from: currentNetwork,
        to: targetNetwork,
        message: `Failed to switch network: ${(e as Error).message}. Please switch manually in your wallet settings.`,
        fallbackUsed: true,
      };
    }
  }

  return {
    success: false,
    from: currentNetwork,
    to: targetNetwork,
    message: 'This wallet does not support programmatic network switching. Please switch networks manually in your wallet extension settings.',
    fallbackUsed: true,
  };
}

export function checkNetworkMismatch(
  expectedNetwork: string,
  actualNetwork: string,
  chain?: ChainType
): { mismatch: boolean; warning?: string } {
  if (expectedNetwork === actualNetwork) {
    return { mismatch: false };
  }

  const chainLabel = chain || 'stacks';
  return {
    mismatch: true,
    warning: `Network mismatch: the app expects ${chainLabel} ${expectedNetwork} but your wallet is connected to ${chainLabel} ${actualNetwork}. Some features may not work correctly.`,
  };
}

export function getDefaultNetwork(chain: ChainType): string {
  switch (chain) {
    case 'stacks': return 'mainnet';
    case 'bitcoin': return 'mainnet';
    case 'ethereum': return 'mainnet';
    case 'solana': return 'mainnet-beta';
    case 'sui': return 'mainnet';
    case 'aptos': return 'mainnet';
  }
}

export function isValidNetwork(network: string, chain: ChainType): boolean {
  const map = getNetworkMap(chain);
  return network in map;
}

export function getSupportedNetworks(chain: ChainType): string[] {
  const map = getNetworkMap(chain);
  return Object.keys(map);
}
