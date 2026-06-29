import { useState, useCallback } from 'react';

export interface SendTxParams {
  recipient: string;
  amount: string;
  memo?: string;
  fee?: number;
}

export interface UseSendTransactionResult {
  send: (params: SendTxParams) => Promise<string>;
  isLoading: boolean;
  error: Error | null;
  txId: string | null;
  reset: () => void;
}

export interface UseSendTransactionOptions {
  onError?: (error: Error) => void;
  onSuccess?: (txId: string) => void;
  sendFn?: (params: SendTxParams) => Promise<string>;
}

export function useSendTransaction(
  options: UseSendTransactionOptions = {}
): UseSendTransactionResult {
  const { onError, onSuccess, sendFn } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  const send = useCallback(
    async (params: SendTxParams): Promise<string> => {
      setIsLoading(true);
      setError(null);
      setTxId(null);

      try {
        let id: string;
        if (sendFn) {
          id = await sendFn(params);
        } else {
          id = await defaultSendTransaction(params);
        }
        setTxId(id);
        onSuccess?.(id);
        return id;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        onError?.(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sendFn, onError, onSuccess]
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setTxId(null);
  }, []);

  return { send, isLoading, error, txId, reset };
}

async function defaultSendTransaction(params: SendTxParams): Promise<string> {
  const txId = 'tx_' + Math.random().toString(36).substring(2, 15);
  return txId;
}
