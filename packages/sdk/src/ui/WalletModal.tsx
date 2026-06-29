import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useWalletContext } from './context';
import { NetworkBadge } from './NetworkBadge';
import { SendForm } from './SendForm';
import { TransactionList } from './TransactionList';
import { useBalance } from './hooks/useBalance';
import { useTransactions } from './hooks/useTransactions';
import { useSendTransaction } from './hooks/useSendTransaction';

export interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect?: () => void;
  children?: ReactNode;
}

export function WalletModal({ isOpen, onClose, onConnect, children }: WalletModalProps) {
  const { wallet, balance: ctxBalance, updateBalance } = useWalletContext();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<'assets' | 'send' | 'history'>('assets');

  const { balance, isLoading: balanceLoading } = useBalance(wallet.address, {
    refreshInterval: 10000,
  });

  const {
    transactions,
    isLoading: txsLoading,
    hasMore,
    loadMore,
  } = useTransactions(wallet.address, {
    refreshInterval: 30000,
    pageSize: 10,
  });

  const { send, isLoading: isSending, error: sendError, txId } = useSendTransaction();

  useEffect(() => {
    if (balance) updateBalance(balance);
  }, [balance, updateBalance]);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      if (modalRef.current) {
        const firstFocusable = modalRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  const displayAddress = wallet.address
    ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`
    : '';

  const displayBalance = balance
    ? (parseInt(balance, 10) / 1_000_000).toLocaleString()
    : '0';

  const tabs = [
    { id: 'assets' as const, label: 'Assets' },
    { id: 'send' as const, label: 'Send' },
    { id: 'history' as const, label: 'History' },
  ];

  return (
    <div
      className="vx-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Wallet"
    >
      <div className="vx-modal" ref={modalRef}>
        <div className="vx-modal__header">
          <h2 className="vx-modal__title">Wallet</h2>
          <button
            type="button"
            className="vx-modal__close vx-focus-ring"
            onClick={onClose}
            aria-label="Close wallet modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {!wallet.connected ? (
          <div className="vx-modal__body vx-modal__body--center">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--vx-color-text-tertiary)"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01" />
            </svg>
            <p className="vx-modal__not-connected-text">Connect your wallet to get started</p>
            <button
              type="button"
              className="vx-modal__connect-btn vx-focus-ring vx-tap-target"
              onClick={onConnect}
            >
              Connect Wallet
            </button>
            {children}
          </div>
        ) : (
          <>
            <div className="vx-modal__wallet-info">
              <div className="vx-modal__address-row">
                <span className="vx-modal__address-label">Address</span>
                <code className="vx-modal__address">{displayAddress}</code>
              </div>
              <div className="vx-modal__network-row">
                <NetworkBadge network={wallet.network} />
              </div>
            </div>

            <div className="vx-modal__balance">
              <span className="vx-modal__balance-label">Balance</span>
              <span className="vx-modal__balance-amount">
                {balanceLoading ? (
                  <span className="vx-spinner" aria-label="Loading balance" />
                ) : (
                  <>{displayBalance} <small>STX</small></>
                )}
              </span>
            </div>

            <nav className="vx-modal__tabs" role="tablist" aria-label="Wallet sections">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className={`vx-modal__tab vx-focus-ring ${activeTab === tab.id ? 'vx-modal__tab--active' : ''}`}
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="vx-modal__body">
              {activeTab === 'assets' && (
                <div className="vx-modal__assets" role="tabpanel" aria-label="Assets">
                  {wallet.address && (
                    <div className="vx-modal__asset-item">
                      <span className="vx-modal__asset-symbol">STX</span>
                      <span className="vx-modal__asset-name">Stacks Token</span>
                      <span className="vx-modal__asset-balance">
                        {balanceLoading ? (
                          <span className="vx-spinner" aria-label="Loading" />
                        ) : (
                          displayBalance
                        )}
                      </span>
                    </div>
                  )}
                  {ctxBalance && ctxBalance !== balance && (
                    <div className="vx-modal__asset-item">
                      <span className="vx-modal__asset-symbol">...</span>
                      <span className="vx-modal__asset-name">Check tokens</span>
                      <span className="vx-modal__asset-balance">-</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'send' && (
                <div role="tabpanel" aria-label="Send">
                  <SendForm
                    onSend={send}
                    isLoading={isSending}
                    error={sendError}
                    txId={txId}
                  />
                </div>
              )}

              {activeTab === 'history' && (
                <div role="tabpanel" aria-label="History">
                  <TransactionList
                    transactions={transactions}
                    isLoading={txsLoading}
                    hasMore={hasMore}
                    onLoadMore={loadMore}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
