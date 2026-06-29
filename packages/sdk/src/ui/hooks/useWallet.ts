import { useWalletContext, WalletContextValue } from '../context';
import { useBalance, UseBalanceOptions } from './useBalance';
import { useTransactions, UseTransactionsOptions } from './useTransactions';
import { useSendTransaction, UseSendTransactionOptions, SendTxParams } from './useSendTransaction';

export interface UseWalletOptions {
  balance?: UseBalanceOptions;
  transactions?: UseTransactionsOptions;
  send?: UseSendTransactionOptions;
}

export interface UseWalletResult {
  wallet: WalletContextValue['wallet'];
  connect: WalletContextValue['connect'];
  disconnect: WalletContextValue['disconnect'];
  setNetwork: WalletContextValue['setNetwork'];
  balance: string | null;
  balanceLoading: boolean;
  balanceError: Error | null;
  refreshBalance: () => void;
  transactions: ReturnType<typeof useTransactions>['transactions'];
  transactionsLoading: boolean;
  transactionsError: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refreshTransactions: () => void;
  send: (params: SendTxParams) => Promise<string>;
  isSending: boolean;
  sendError: Error | null;
  txId: string | null;
  resetSend: () => void;
}

export function useWallet(options: UseWalletOptions = {}): UseWalletResult {
  const ctx = useWalletContext();

  const { balance, isLoading: balanceLoading, error: balanceError, refresh: refreshBalance } =
    useBalance(ctx.wallet.address, options.balance);

  const {
    transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
    hasMore,
    loadMore,
    refresh: refreshTransactions,
  } = useTransactions(ctx.wallet.address, options.transactions);

  const {
    send,
    isLoading: isSending,
    error: sendError,
    txId,
    reset: resetSend,
  } = useSendTransaction(options.send);

  return {
    wallet: ctx.wallet,
    connect: ctx.connect,
    disconnect: () => {
      ctx.disconnect();
    },
    setNetwork: ctx.setNetwork,
    balance,
    balanceLoading,
    balanceError,
    refreshBalance,
    transactions,
    transactionsLoading,
    transactionsError,
    hasMore,
    loadMore,
    refreshTransactions,
    send,
    isSending,
    sendError,
    txId,
    resetSend,
  };
}
