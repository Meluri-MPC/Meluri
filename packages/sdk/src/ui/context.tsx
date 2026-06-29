import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export interface WalletState {
  address: string | null;
  connectorId: string | null;
  network: string;
  chain: string;
  connected: boolean;
}

export interface WalletContextValue {
  wallet: WalletState;
  connect: (address: string, connectorId: string, network?: string, chain?: string) => void;
  disconnect: () => void;
  setNetwork: (network: string) => void;
  updateBalance: (balance: string | null) => void;
  balance: string | null;
}

const defaultWalletState: WalletState = {
  address: null,
  connectorId: null,
  network: 'mainnet',
  chain: 'stacks',
  connected: false,
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>(defaultWalletState);
  const [balance, setBalance] = useState<string | null>(null);

  const connect = useCallback(
    (address: string, connectorId: string, network = 'mainnet', chain = 'stacks') => {
      setWallet({ address, connectorId, network, chain, connected: true });
    },
    []
  );

  const disconnect = useCallback(() => {
    setWallet(defaultWalletState);
    setBalance(null);
  }, []);

  const setNetwork = useCallback((network: string) => {
    setWallet((prev) => ({ ...prev, network }));
  }, []);

  const updateBalance = useCallback((b: string | null) => {
    setBalance(b);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({ wallet, connect, disconnect, setNetwork, updateBalance, balance }),
    [wallet, balance, connect, disconnect, setNetwork, updateBalance]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWalletContext(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWalletContext must be used within a <WalletProvider>');
  }
  return ctx;
}
