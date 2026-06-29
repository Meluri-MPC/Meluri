import type { WalletConnector, ConnectResult, WalletProvider, ChainType } from '../types';

function getXverseProvider(): unknown {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  return w['XverseProvider'] || w['BitcoinProvider'];
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

function wrapXverseProvider(raw: unknown): WalletProvider {
  const p = raw as Record<string, unknown>;

  return {
    async getAddresses(): Promise<string[]> {
      if (typeof p.getAddresses === 'function') {
        const result = await p.getAddresses();
        if (Array.isArray(result)) return result;
        if (typeof result === 'object' && result !== null && 'addresses' in result) {
          const addrs = (result as Record<string, unknown>).addresses;
          if (Array.isArray(addrs)) {
            return addrs.map((a: string | { address: string }) =>
              typeof a === 'string' ? a : a.address
            );
          }
        }
      }
      if (typeof p.request === 'function') {
        const result = await p.request({ method: 'getAddresses' });
        if (Array.isArray(result)) return result;
        if (result && typeof result === 'object' && 'addresses' in result) {
          return (result as Record<string, unknown>).addresses as string[];
        }
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
        const result = await p.request({ method: 'signMessage', params: { message } });
        if (result && typeof result === 'object' && 'signature' in result) {
          return (result as Record<string, unknown>).signature as string;
        }
        if (typeof result === 'string') return result;
      }
      throw new Error('Xverse: signMessage not supported');
    },

    async signTransaction(tx: unknown): Promise<string> {
      if (typeof p.signTransaction === 'function') {
        const result = await p.signTransaction(tx);
        if (typeof result === 'string') return result;
        if (result && typeof result === 'object' && 'txHex' in result) {
          return (result as Record<string, unknown>).txHex as string;
        }
      }
      if (typeof p.request === 'function') {
        const result = await p.request({ method: 'stx_signTransaction', params: { transaction: tx } });
        if (result && typeof result === 'object' && 'txHex' in result) {
          return (result as Record<string, unknown>).txHex as string;
        }
        if (typeof result === 'string') return result;
      }
      throw new Error('Xverse: signTransaction not supported');
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
      throw new Error('Xverse: signStructuredData not supported');
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
        await p.request({ method: 'wallet_switchNetwork', params: { network } });
        return;
      }
      throw new Error('Xverse does not support programmatic network switching');
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
      return getXverseProvider() !== undefined;
    },

    async getPublicKey(): Promise<string> {
      if (typeof p.getPublicKey === 'function') {
        return p.getPublicKey() as Promise<string>;
      }
      if (typeof p.request === 'function') {
        const result = await p.request({ method: 'getPublicKey' });
        if (result && typeof result === 'object' && 'publicKey' in result) {
          return (result as Record<string, unknown>).publicKey as string;
        }
      }
      return '';
    },
  };
}

export const xverseConnector: WalletConnector = {
  id: 'xverse',
  name: 'Xverse',
  icon: 'xverse',
  chains: ['stacks', 'bitcoin'],
  supportedNetworks: {
    stacks: ['mainnet', 'testnet', 'devnet', 'mocknet'],
    bitcoin: ['mainnet', 'testnet', 'regtest', 'signet'],
  },
  installUrl: 'https://www.xverse.app/download',

  isAvailable(): boolean {
    return getXverseProvider() !== undefined;
  },

  getProvider(): WalletProvider | null {
    const raw = getXverseProvider();
    if (!raw) return null;
    return wrapXverseProvider(raw);
  },

  async connect(chain?: ChainType): Promise<ConnectResult> {
    const raw = getXverseProvider();
    if (!raw) throw new Error('Xverse wallet not detected. Please install Xverse extension.');
    const provider = wrapXverseProvider(raw);

    let addresses: string[];
    try {
      addresses = await provider.getAddresses();
    } catch {
      throw new Error('Xverse: user rejected connection or wallet is locked');
    }

    if (addresses.length === 0) {
      throw new Error('Xverse: no accounts found. Please create an account in Xverse.');
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
      connectorId: 'xverse',
    };
  },

  async disconnect(): Promise<void> {
    // Xverse doesn't have a programmatic disconnect
  },
};
