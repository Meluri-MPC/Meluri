import { useState, useEffect, useCallback, useRef } from 'react';
import type { TransactionRecord } from '../../types';

export interface UseBalanceOptions {
  refreshInterval?: number;
  onError?: (error: Error) => void;
  fetchBalance?: (address: string) => Promise<string>;
}

export interface UseBalanceResult {
  balance: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useBalance(
  address: string | null,
  options: UseBalanceOptions = {}
): UseBalanceResult {
  const { refreshInterval = 10000, onError, fetchBalance } = options;
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let b: string | null = null;
      if (fetchBalance) {
        b = await fetchBalance(address);
      } else {
        b = await defaultFetchBalance(address);
      }
      setBalance(b);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      onError?.(err);
    } finally {
      setIsLoading(false);
    }
  }, [address, fetchBalance, onError]);

  useEffect(() => {
    refresh();

    if (address && refreshInterval > 0) {
      intervalRef.current = setInterval(refresh, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [address, refreshInterval, refresh]);

  return { balance, isLoading, error, refresh };
}

async function defaultFetchBalance(address: string): Promise<string> {
  const res = await fetch(`https://api.hiro.so/extended/v1/address/${address}/stx`);
  if (!res.ok) throw new Error(`Failed to fetch balance: ${res.statusText}`);
  const data = await res.json();
  return data.balance || '0';
}
