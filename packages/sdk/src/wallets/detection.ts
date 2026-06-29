import type { ChainType, WalletConnector, WalletConnectionConfig } from './types';

const LEATHER_PROVIDER_KEY = 'LeatherProvider';
const XVERS_PROVIDER_KEY = 'XverseProvider';
const ASIGNA_PROVIDER_KEY = 'AsignaProvider';
const METAMASK_PROVIDER_KEY = 'ethereum';
const PHANTOM_PROVIDER_KEY = 'phantom';
const MARTIAN_PROVIDER_KEY = 'martian';
const PETRA_PROVIDER_KEY = 'petra';

interface GlobalProviders {
  LeatherProvider?: unknown;
  XverseProvider?: unknown;
  AsignaProvider?: unknown;
  ethereum?: unknown;
  phantom?: { solana?: unknown };
  martian?: unknown;
  petra?: unknown;
}

function getGlobalProviders(): GlobalProviders {
  if (typeof window === 'undefined') return {};
  const w = window as unknown as Record<string, unknown>;
  return {
    LeatherProvider: w[LEATHER_PROVIDER_KEY],
    XverseProvider: w[XVERS_PROVIDER_KEY],
    AsignaProvider: w[ASIGNA_PROVIDER_KEY],
    ethereum: w[METAMASK_PROVIDER_KEY],
    phantom: w[PHANTOM_PROVIDER_KEY] as { solana?: unknown } | undefined,
    martian: w[MARTIAN_PROVIDER_KEY],
    petra: w[PETRA_PROVIDER_KEY],
  };
}

export interface DetectedProvider {
  id: string;
  name: string;
  provider: unknown;
  chains: ChainType[];
  isDefault?: boolean;
}

export function detectProviders(
  connectors: WalletConnector[],
  config?: WalletConnectionConfig
): DetectedProvider[] {
  const results: DetectedProvider[] = [];

  for (const connector of connectors) {
    if (connector.isAvailable()) {
      results.push({
        id: connector.id,
        name: connector.name,
        provider: connector.getProvider(),
        chains: connector.chains,
        isDefault: false,
      });
    }
  }

  if (config?.preferredWallets) {
    const prefIds = new Set(config.preferredWallets);
    results.sort((a, b) => {
      const aPref = prefIds.has(a.id) ? 0 : 1;
      const bPref = prefIds.has(b.id) ? 0 : 1;
      return aPref - bPref;
    });
    if (results.length > 0 && prefIds.has(results[0].id)) {
      results[0].isDefault = true;
    }
  }

  return results;
}

export function detectChainProviders(chain: ChainType): DetectedProvider[] {
  const globals = getGlobalProviders();
  const results: DetectedProvider[] = [];

  if ((chain === 'stacks' || chain === 'bitcoin') && globals.LeatherProvider) {
    results.push({
      id: 'leather',
      name: 'Leather',
      provider: globals.LeatherProvider,
      chains: ['stacks', 'bitcoin'],
    });
  }

  if ((chain === 'stacks' || chain === 'bitcoin') && globals.XverseProvider) {
    results.push({
      id: 'xverse',
      name: 'Xverse',
      provider: globals.XverseProvider,
      chains: ['stacks', 'bitcoin'],
    });
  }

  if (chain === 'stacks' && globals.AsignaProvider) {
    results.push({
      id: 'asigna',
      name: 'Asigna',
      provider: globals.AsignaProvider,
      chains: ['stacks', 'bitcoin'],
    });
  }

  if (chain === 'ethereum' && globals.ethereum) {
    results.push({
      id: 'metamask',
      name: 'MetaMask',
      provider: globals.ethereum,
      chains: ['ethereum'],
    });
  }

  if (chain === 'solana' && globals.phantom?.solana) {
    results.push({
      id: 'phantom',
      name: 'Phantom',
      provider: globals.phantom.solana,
      chains: ['solana'],
    });
  }

  if (chain === 'sui' && globals.martian) {
    results.push({
      id: 'martian',
      name: 'Martian',
      provider: globals.martian,
      chains: ['sui', 'aptos'],
    });
  }

  if (chain === 'aptos' && globals.petra) {
    results.push({
      id: 'petra',
      name: 'Petra',
      provider: globals.petra,
      chains: ['aptos'],
    });
  }

  return results;
}

export function hasProvider(id: string): boolean {
  const globals = getGlobalProviders();
  const keyMap: Record<string, string> = {
    leather: LEATHER_PROVIDER_KEY,
    xverse: XVERS_PROVIDER_KEY,
    asigna: ASIGNA_PROVIDER_KEY,
    metamask: METAMASK_PROVIDER_KEY,
    phantom: PHANTOM_PROVIDER_KEY,
    martian: MARTIAN_PROVIDER_KEY,
    petra: PETRA_PROVIDER_KEY,
  };
  const key = keyMap[id];
  if (!key) return false;
  return (globals as Record<string, unknown>)[key] !== undefined;
}
