import { useWalletContext } from './context';

export interface WalletButtonProps {
  showAddress?: boolean;
  truncateAddress?: boolean;
  label?: string;
  onClick?: () => void;
  className?: string;
}

export function WalletButton({
  showAddress = true,
  truncateAddress = true,
  label = 'Connect Wallet',
  onClick,
  className = '',
}: WalletButtonProps) {
  const { wallet, connect, disconnect } = useWalletContext();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (wallet.connected) {
      disconnect();
    }
  };

  if (!wallet.connected) {
    return (
      <button
        type="button"
        className={`vx-wallet-button vx-wallet-button--connect vx-focus-ring vx-tap-target ${className}`}
        onClick={handleClick}
        aria-label={label}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="vx-wallet-button__icon"
          aria-hidden="true"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h.01M10 16h.01M14 16h.01" />
        </svg>
        <span>{label}</span>
      </button>
    );
  }

  const displayAddress =
    showAddress && wallet.address
      ? truncateAddress
        ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
        : wallet.address
      : null;

  return (
    <button
      type="button"
      className={`vx-wallet-button vx-wallet-button--connected vx-focus-ring vx-tap-target ${className}`}
      onClick={handleClick}
      aria-label={displayAddress ? `Connected: ${displayAddress}` : 'Connected wallet'}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="vx-wallet-button__dot"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
      </svg>
      {displayAddress && <span className="vx-wallet-button__address">{displayAddress}</span>}
    </button>
  );
}
