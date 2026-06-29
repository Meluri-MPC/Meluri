import type { WalletConnector, ConnectResult, WalletProvider, ChainType } from '../types';

function getLeatherProvider(): unknown {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  return w['LeatherProvider'] || w['HiroWalletProvider'] || w['StacksProvider'];
}

function normalizeNetwork(raw: string): string {
  const map: Record<string, string> = {
    mainnet: 'mainnet',
    testnet: 'testnet',
    devnet: 'devnet',
    mocknet: 'mocknet',
    regtest: 'regtest',
    signet: 'signet',
  };
  const lower = raw.toLowerCase();
  return map[lower] || lower;
}

function wrapLeatherProvider(raw: unknown): WalletProvider {
  const p = raw as Record<string, unknown>;

  return {
    async getAddresses(): Promise<string[]> {
      if (typeof p.getAddresses === 'function') {
        const result = await p.getAddresses();
        if (Array.isArray(result)) return result;
        if (typeof result === 'object' && result !== null && 'addresses' in result) {
          return (result as Record<string, unknown>).addresses as string[];
        }
      }
      if (typeof p.request === 'function') {
        const result = await p.request({ method: 'stx_getAddresses' });
        if (result && typeof result === 'object' && 'addresses' in result) {
          return (result as Record<string, unknown>).addresses as string[];
        }
        if (Array.isArray(result)) return result;
      }
      return [];
    },

    async signMessage(message: string): Promise<string> {
      if (typeof p.signMessage === 'function') {
        const result = await p.signMessage({ message });
        if (typeof result === 'string') return result;
        if (result && typeof result === 'object' && 'signature' in result) {
          return (result as Record<string, unknown>).signature as string;
        }
      }
      if (typeof p.request === 'function') {
        const result = await p.request({ method: 'stx_signMessage', params: { message } });
        if (result && typeof result === 'object' && 'signature' in result) {
          return (result as Record<string, unknown>).signature as string;
        }
        if (typeof result === 'string') return result;
      }
      throw new Error('Leather: signMessage not supported');
    },

    async signTransaction(tx: unknown): Promise<string> {
      if (typeof p.signTransaction === 'function') {
        const result = await p.signTransaction(tx);
        if (typeof result === 'string') return result;
        if (result && typeof result === 'object' && 'txHex' in result) {
          return (result as Record<string, unknown>).txHex as string;
        }
        if (result && typeof result === 'object' && 'transaction' in result) {
          return (result as Record<string, unknown>).transaction as string;
        }
      }
      if (typeof p.request === 'function') {
        const result = await p.request({ method: 'stx_signTransaction', params: { transaction: tx } });
        if (result && typeof result === 'object' && 'txHex' in result) {
          return (result as Record<string, unknown>).txHex as string;
        }
        if (typeof result === 'string') return result;
      }
      throw new Error('Leather: signTransaction not supported');
    },

    async signStructuredData(domain: unknown, types: unknown, message: unknown): Promise<string> {
      if (typeof p.signStructuredMessage === 'function') {
        const result = await p.signStructuredMessage({ domain, types, message });
        if (typeof result === 'string') return result;
        if (result && typeof result === 'object' && 'signature' in result) {
          return (result as Record<string, unknown>).signature as string;
        }
      }
      if (typeof p.request === 'function') {
        const result = await p.request({ method: 'stx_signStructuredMessage', params: { domain, types, message } });
        if (result && typeof result === 'object' && 'signature' in result) {
          return (result as Record<string, unknown>).signature as string;
        }
      }
      throw new Error('Leather: signStructuredData not supported');
    },

    async getNetwork(): Promise<string> {
      if (typeof p.getNetwork === 'function') {
        const result = await p.getNetwork();
        return normalizeNetwork(typeof result === 'string' ? result : (result as Record<string, unknown>)?.version as string || '');
      }
      if (typeof p.request === 'function') {
        const result = await p.request({ method: 'stx_getNetwork' });
        if (result && typeof result === 'object' && 'version' in result) {
          return normalizeNetwork((result as Record<string, unknown>).version as string);
        }
      }
      return 'mainnet';
    },

    async switchNetwork(network: string): Promise<void> {
      if (typeof p.switchNetwork === 'function') {
        await p.switchNetwork(network);
        return;
      }
      if (typeof p.request === 'function') {
        await p.request({ method: 'wallet_switchStacksNetwork', params: { network } });
        return;
      }
      throw new Error('Leather does not support programmatic network switching');
    },

    on(event: string, callback: (...args: unknown[]) => void): void {
      if (typeof p.on === 'function') {
        p.on(event, callback);
      } else if (typeof p.addEventListener === 'function') {
        p.addEventListener(event, callback);
      }
    },

    off(event: string, callback: (...args: unknown[]) => void): void {
      if (typeof p.off === 'function') {
        p.off(event, callback);
      } else if (typeof p.removeEventListener === 'function') {
        p.removeEventListener(event, callback);
      }
    },

    isConnected(): boolean {
      if (typeof p.isConnected === 'function') {
        return !!p.isConnected();
      }
      return getLeatherProvider() !== undefined;
    },

    async getPublicKey(): Promise<string> {
      if (typeof p.getPublicKey === 'function') {
        return p.getPublicKey() as Promise<string>;
      }
      if (typeof p.request === 'function') {
        const result = await p.request({ method: 'stx_getPublicKey' });
        if (result && typeof result === 'object' && 'publicKey' in result) {
          return (result as Record<string, unknown>).publicKey as string;
        }
      }
      return '';
    },
  };
}

export const leatherConnector: WalletConnector = {
  id: 'leather',
  name: 'Leather',
  icon: 'leather',
  chains: ['stacks', 'bitcoin'],
  supportedNetworks: {
    stacks: ['mainnet', 'testnet', 'devnet', 'mocknet'],
    bitcoin: ['mainnet', 'testnet', 'regtest', 'signet'],
  },
  installUrl: 'https://leather.io/install',

  isAvailable(): boolean {
    return getLeatherProvider() !== undefined;
  },

  getProvider(): WalletProvider | null {
    const raw = getLeatherProvider();
    if (!raw) return null;
    return wrapLeatherProvider(raw);
  },

  async connect(chain?: ChainType): Promise<ConnectResult> {
    const raw = getLeatherProvider();
    if (!raw) throw new Error('Leather wallet not detected. Please install Leather extension.');
    const provider = wrapLeatherProvider(raw);

    let addresses: string[];
    try {
      addresses = await provider.getAddresses();
    } catch {
      throw new Error('Leather: user rejected connection or wallet is locked');
    }

    if (addresses.length === 0) {
      throw new Error('Leather: no accounts found. Please create an account in Leather.');
    }

    const network = await provider.getNetwork() as ConnectResult['network'];
    const targetChain = chain || 'stacks';
    let pubKey = '';
    try {
      pubKey = await provider.getPublicKey?.() || '';
    } catch {}

    return {
      address: addresses[0],
      publicKey: pubKey || addresses[0],
      chain: targetChain,
      network,
      provider,
      connectorId: 'leather',
    };
  },

  async disconnect(): Promise<void> {
    // Leather wallets don't have a programmatic disconnect
  },
};
