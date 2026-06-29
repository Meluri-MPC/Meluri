import type { TransactionRecord } from '../types';

export interface TransactionListProps {
  transactions: TransactionRecord[];
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  emptyMessage?: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'vx-tx-status--confirmed' },
  success: { label: 'Success', className: 'vx-tx-status--confirmed' },
  pending: { label: 'Pending', className: 'vx-tx-status--pending' },
  failed: { label: 'Failed', className: 'vx-tx-status--failed' },
  dropped: { label: 'Dropped', className: 'vx-tx-status--failed' },
};

function getStatusInfo(status: string) {
  return statusConfig[status] || { label: status, className: 'vx-tx-status--pending' };
}

function formatAmount(amount: string | undefined): string {
  if (!amount || amount === '0') return '';
  const num = parseInt(amount, 10);
  if (isNaN(num)) return '';
  return (num / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function TransactionList({
  transactions,
  isLoading = false,
  hasMore = false,
  onLoadMore,
  emptyMessage = 'No transactions yet',
  className = '',
}: TransactionListProps) {
  return (
    <div className={`vx-tx-list ${className}`} role="region" aria-label="Transaction history">
      {transactions.length === 0 && !isLoading ? (
        <div className="vx-tx-list__empty" role="status">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--vx-color-text-tertiary)"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01" />
          </svg>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <ul className="vx-tx-list__items" role="list">
          {transactions.map((tx) => {
            const status = getStatusInfo(tx.status);
            const amt = formatAmount(tx.amount);
            return (
              <li key={tx.id} className="vx-tx-list__item vx-focus-ring" tabIndex={0}>
                <div className="vx-tx-list__item-main">
                  <div className="vx-tx-list__item-type">
                    {tx.type === 'token_transfer' || tx.type === 'STX_TRANSFER' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" />
                      </svg>
                    )}
                    <span>{tx.type === 'token_transfer' || tx.type === 'STX_TRANSFER' ? 'Transfer' : tx.type}</span>
                  </div>
                  {amt && <span className="vx-tx-list__item-amount">{amt} STX</span>}
                </div>

                <div className="vx-tx-list__item-meta">
                  <span className="vx-tx-list__item-address" title={tx.toAddress || tx.fromAddress}>
                    {tx.toAddress
                      ? `To: ${truncateAddress(tx.toAddress)}`
                      : `From: ${truncateAddress(tx.fromAddress)}`}
                  </span>
                  <span className="vx-tx-list__item-date">
                    {formatDate(tx.createdAt)}
                  </span>
                </div>

                <div className="vx-tx-list__item-footer">
                  <span className={`vx-tx-status ${status.className}`}>
                    <span
                      className="vx-tx-status__dot"
                      aria-hidden="true"
                    />
                    {status.label}
                  </span>
                  {tx.blockHeight && (
                    <span className="vx-tx-list__item-block">
                      Block #{tx.blockHeight}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          className="vx-tx-list__load-more vx-focus-ring vx-tap-target"
          onClick={onLoadMore}
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? (
            <>
              <span className="vx-spinner" aria-hidden="true" />
              Loading...
            </>
          ) : (
            'Load more'
          )}
        </button>
      )}
    </div>
  );
}
