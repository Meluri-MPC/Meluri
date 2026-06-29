/**
 * Chain Registry — maps chain identifiers to their cryptographic configuration.
 *
 * Usage:
 *   import { getChainConfig, getCurveForChain } from '../chains/registry';
 *   const curve = getCurveForChain('solana'); // 'ed25519'
 *   const config = getChainConfig('stacks');  // { curve: 'secp256k1', coinType: 5757, ... }
 */

import type { ChainConfig, ChainId, CurveType } from './types';

/** Registry of all supported chains */
const chains: Record<ChainId, ChainConfig> = {
  stacks: {
    id: 'stacks',
    name: 'Stacks',
    curve: 'secp256k1',
    coinType: 5757,
    derivationPath: "m/44'/5757'/0'/0/0",
    addressVersion: 22,
    enabled: true,
    chainIdHex: '0x00000001',
  },
  bitcoin: {
    id: 'bitcoin',
    name: 'Bitcoin',
    curve: 'secp256k1',
    coinType: 0,
    derivationPath: "m/44'/0'/0'/0/0",
    enabled: true,
  },
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    curve: 'secp256k1',
    coinType: 60,
    derivationPath: "m/44'/60'/0'/0/0",
    enabled: true,
    chainIdHex: '0x1',
  },
  solana: {
    id: 'solana',
    name: 'Solana',
    curve: 'ed25519',
    coinType: 501,
    derivationPath: "m/44'/501'/0'/0'",
    enabled: false,
  },
  sui: {
    id: 'sui',
    name: 'Sui',
    curve: 'ed25519',
    coinType: 784,
    derivationPath: "m/44'/784'/0'/0'/0'",
    enabled: false,
  },
  aptos: {
    id: 'aptos',
    name: 'Aptos',
    curve: 'ed25519',
    coinType: 637,
    derivationPath: "m/44'/637'/0'/0'/0'",
    enabled: false,
  },
};

/**
 * Get the full chain configuration.
 * Throws if the chain is not found.
 */
export function getChainConfig(chainId: ChainId): ChainConfig {
  const config = chains[chainId];
  if (!config) {
    throw new Error(`Unknown chain: ${chainId}. Available: ${Object.keys(chains).join(', ')}`);
  }
  return config;
}

/**
 * Get the curve type for a given chain.
 */
export function getCurveForChain(chainId: ChainId): CurveType {
  return getChainConfig(chainId).curve;
}

/**
 * Check if a chain is enabled.
 */
export function isChainEnabled(chainId: ChainId): boolean {
  return getChainConfig(chainId).enabled;
}

/**
 * List all enabled chains.
 */
export function listEnabledChains(): ChainConfig[] {
  return Object.values(chains).filter((c) => c.enabled);
}

/**
 * List all registered chains (including disabled).
 */
export function listAllChains(): ChainConfig[] {
  return Object.values(chains);
}

/**
 * Get all chains that use a specific curve.
 */
export function getChainsForCurve(curve: CurveType): ChainConfig[] {
  return Object.values(chains).filter((c) => c.curve === curve);
}

/**
 * Resolve a string to a valid ChainId.
 * Accepts shorthand aliases (e.g. 'stx' → 'stacks', 'eth' → 'ethereum').
 */
export function resolveChainId(input: string): ChainId {
  const aliases: Record<string, ChainId> = {
    stx: 'stacks',
    btc: 'bitcoin',
    eth: 'ethereum',
    sol: 'solana',
  };

  const resolved = aliases[input.toLowerCase()] ?? input.toLowerCase();
  if (!(resolved in chains)) {
    throw new Error(`Unknown chain: ${input}. Available: ${Object.keys(chains).join(', ')}`);
  }
  return resolved as ChainId;
}

export type { ChainConfig, ChainId, CurveType };
