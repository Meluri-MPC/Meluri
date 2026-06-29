import { useState, useEffect, useCallback, useRef } from 'react';
import type { TransactionRecord } from '../../types';

export interface UseTransactionsOptions {
  refreshInterval?: number;
  onError?: (error: Error) => void;
  pageSize?: number;
  fetchTransactions?: (walletId: string, page: number, pageSize: number) => Promise<{ transactions: TransactionRecord[]; hasMore: boolean }>;
}

export interface UseTransactionsResult {
  transactions: TransactionRecord[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

export function useTransactions(
  walletId: string | null,
  options: UseTransactionsOptions = {}
): UseTransactionsResult {
  const { refreshInterval = 30000, onError, pageSize = 20, fetchTransactions } = options;
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoadingRef = useRef(false);

  const fetchPage = useCallback(
    async (page: number) => {
      if (!walletId) return;

      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        let result: { transactions: TransactionRecord[]; hasMore: boolean };
        if (fetchTransactions) {
          result = await fetchTransactions(walletId, page, pageSize);
        } else {
          result = await defaultFetchTransactions(walletId, page, pageSize);
        }

        setTransactions((prev) => (page === 0 ? result.transactions : [...prev, ...result.transactions]));
        setHasMore(result.hasMore);
        pageRef.current = page + 1;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        onError?.(err);
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    },
    [walletId, pageSize, fetchTransactions, onError]
  );

  const refresh = useCallback(() => {
    pageRef.current = 0;
    fetchPage(0);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingRef.current) {
      fetchPage(pageRef.current);
    }
  }, [hasMore, fetchPage]);

  useEffect(() => {
    refresh();

    if (walletId && refreshInterval > 0) {
      intervalRef.current = setInterval(refresh, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [walletId, refreshInterval, refresh]);

  return { transactions, isLoading, error, hasMore, loadMore, refresh };
}

async function defaultFetchTransactions(
  address: string,
  page: number,
  pageSize: number
): Promise<{ transactions: TransactionRecord[]; hasMore: boolean }> {
  const res = await fetch(
    `https://api.hiro.so/extended/v1/address/${address}/transactions?limit=${pageSize}&offset=${page * pageSize}`
  );
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.statusText}`);
  const data = await res.json();

  const transactions: TransactionRecord[] = (data.results || []).map((tx: any) => ({
    id: tx.tx_id,
    txid: tx.tx_id,
    type: tx.tx_type || 'contract_call',
    fromAddress: tx.sender_address || '',
    toAddress: tx.token_transfer?.recipient_address || tx.contract_call?.contract_id || '',
    amount: tx.token_transfer?.amount || '0',
    status: tx.tx_status === 'success' ? 'confirmed' : tx.tx_status || 'pending',
    blockHeight: tx.block_height,
    network: 'mainnet',
    createdAt: tx.burn_block_time_iso || new Date().toISOString(),
  }));

  return {
    transactions,
    hasMore: transactions.length === pageSize,
  };
}
