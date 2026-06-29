import type { WalletEventCallbacks, WalletProvider } from './types';

export class WalletEventBus {
  private callbacks: WalletEventCallbacks;
  private listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();
  private boundProviders: Set<WalletProvider> = new Set();
  private providerHandlers: Map<WalletProvider, Map<string, Array<(...args: unknown[]) => void>>> = new Map();

  constructor(callbacks?: WalletEventCallbacks) {
    this.callbacks = callbacks ?? {};
  }

  setCallbacks(callbacks: WalletEventCallbacks): void {
    this.callbacks = callbacks;
  }

  bindProvider(provider: WalletProvider): void {
    if (this.boundProviders.has(provider)) return;
    this.boundProviders.add(provider);

    const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    this.providerHandlers.set(provider, handlers);

    try {
      const onAccounts = (accounts: string[]) => {
        this.emit('accountsChanged', accounts);
        try {
          if (this.callbacks.onAccountsChanged) {
            this.callbacks.onAccountsChanged(accounts);
          }
        } catch {}
      };
      provider.on('accountsChanged', onAccounts as (...args: unknown[]) => void);
      const evtHandlers = handlers.get('accountsChanged') || [];
      evtHandlers.push(onAccounts as (...args: unknown[]) => void);
      handlers.set('accountsChanged', evtHandlers);
    } catch {}

    try {
      const onNetwork = (network: string) => {
        this.emit('networkChanged', network);
        try {
          if (this.callbacks.onNetworkChanged) {
            this.callbacks.onNetworkChanged(network);
          }
        } catch {}
      };
      provider.on('networkChanged', onNetwork as (...args: unknown[]) => void);
      const evtHandlers = handlers.get('networkChanged') || [];
      evtHandlers.push(onNetwork as (...args: unknown[]) => void);
      handlers.set('networkChanged', evtHandlers);
    } catch {}

    try {
      const onDisconnect = () => {
        this.emit('disconnect');
        try {
          if (this.callbacks.onDisconnect) {
            this.callbacks.onDisconnect();
          }
        } catch {}
      };
      provider.on('disconnect', onDisconnect as (...args: unknown[]) => void);
      const evtHandlers = handlers.get('disconnect') || [];
      evtHandlers.push(onDisconnect as (...args: unknown[]) => void);
      handlers.set('disconnect', evtHandlers);
    } catch {}
  }

  unbindProvider(provider: WalletProvider): void {
    this.boundProviders.delete(provider);

    const handlers = this.providerHandlers.get(provider);
    if (handlers) {
      for (const [event, eventHandlers] of handlers.entries()) {
        for (const handler of eventHandlers) {
          try {
            provider.off(event, handler);
          } catch {}
        }
      }
      this.providerHandlers.delete(provider);
    }
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    const handlers = this.listeners.get(event) || [];
    handlers.push(callback);
    this.listeners.set(event, handlers);
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      this.listeners.set(event, handlers.filter((h) => h !== callback));
    }
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event) || [];
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch {}
    }
  }

  destroy(): void {
    for (const provider of this.boundProviders) {
      this.unbindProvider(provider);
    }
    this.listeners.clear();
    this.boundProviders.clear();
    this.providerHandlers.clear();
    this.callbacks = {};
  }
}
