import type { WalletConnector, ConnectResult, WalletProvider, ChainType } from '../types';

function getAsignaProvider(): unknown {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as Record<string, unknown>)['AsignaProvider'];
}

function normalizeNetwork(raw: string): string {
  const map: Record<string, string> = {
    mainnet: 'mainnet',
    testnet: 'testnet',
    devnet: 'devnet',
    mocknet: 'mocknet',
  };
  const lower = raw.toLowerCase();
  return map[lower] || lower;
}

function wrapAsignaProvider(raw: unknown): WalletProvider {
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
      }
      throw new Error('Asigna: signMessage not supported');
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
      }
      throw new Error('Asigna: signTransaction not supported');
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
      throw new Error('Asigna: signStructuredData not supported');
    },

    async getNetwork(): Promise<string> {
      if (typeof p.getNetwork === 'function') {
        const result = await p.getNetwork();
        return normalizeNetwork(typeof result === 'string' ? result : (result as Record<string, unknown>)?.version as string || '');
      }
      return 'mainnet';
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
      return getAsignaProvider() !== undefined;
    },

    async getPublicKey(): Promise<string> {
      if (typeof p.getPublicKey === 'function') {
        return p.getPublicKey() as Promise<string>;
      }
      return '';
    },
  };
}

export const asignaConnector: WalletConnector = {
  id: 'asigna',
  name: 'Asigna',
  icon: 'asigna',
  chains: ['stacks', 'bitcoin'],
  supportedNetworks: {
    stacks: ['mainnet', 'testnet', 'devnet', 'mocknet'],
    bitcoin: ['mainnet', 'testnet'],
  },
  installUrl: 'https://www.asigna.io/',

  isAvailable(): boolean {
    return getAsignaProvider() !== undefined;
  },

  getProvider(): WalletProvider | null {
    const raw = getAsignaProvider();
    if (!raw) return null;
    return wrapAsignaProvider(raw);
  },

  async connect(chain?: ChainType): Promise<ConnectResult> {
    const raw = getAsignaProvider();
    if (!raw) throw new Error('Asigna wallet not detected. Please install Asigna extension.');
    const provider = wrapAsignaProvider(raw);

    let addresses: string[];
    try {
      addresses = await provider.getAddresses();
    } catch {
      throw new Error('Asigna: user rejected connection or wallet is locked');
    }

    if (addresses.length === 0) {
      throw new Error('Asigna: no accounts found. Please create an account in Asigna.');
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
      connectorId: 'asigna',
    };
  },

  async disconnect(): Promise<void> {
    // Asigna doesn't have a programmatic disconnect
  },
};
