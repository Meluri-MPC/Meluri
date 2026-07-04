import { useState, useCallback, useEffect, useRef } from 'react';
import { VelumxMPC, VelumxMPCConfig, MPCWallet } from '../client';
import type { AssetBalances, TransactionRecord } from '../types';

export interface UseVelumxAuthOptions extends VelumxMPCConfig {
  autoLogin?: boolean;
}

export interface UseVelumxAuthResult {
  client: VelumxMPC;
  wallet: MPCWallet | null;
  loading: boolean;
  error: Error | null;
  login: () => Promise<MPCWallet>;
  logout: () => Promise<void>;
  refreshWallet: () => Promise<void>;
}

export function useVelumxAuth(options: UseVelumxAuthOptions): UseVelumxAuthResult {
  const { autoLogin = false, apiKey, auth, network, backendUrl } = options;
  const clientRef = useRef<VelumxMPC>(new VelumxMPC({ apiKey, auth, network, backendUrl }));
  const [wallet, setWallet] = useState<MPCWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const login = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const w = await clientRef.current.login();
      setWallet(w);
      return w;
    } catch (err: any) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await clientRef.current.logout();
      setWallet(null);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    try {
      const w = await clientRef.current.getWallet();
      setWallet(w);
    } catch {}
  }, []);

  useEffect(() => {
    if (autoLogin) {
      clientRef.current.getWallet()
        .then((w) => setWallet(w))
        .catch(() => {});
    }
  }, [autoLogin]);

  return {
    client: clientRef.current,
    wallet,
    loading,
    error,
    login,
    logout,
    refreshWallet,
  };
}
