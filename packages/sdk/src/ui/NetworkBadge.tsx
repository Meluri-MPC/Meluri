export interface NetworkBadgeProps {
  network?: string;
  className?: string;
}

const networkConfig: Record<string, { label: string; color: string; dot: string }> = {
  mainnet: { label: 'Mainnet', color: 'vx-network--mainnet', dot: 'var(--vx-color-network-mainnet)' },
  testnet: { label: 'Testnet', color: 'vx-network--testnet', dot: 'var(--vx-color-network-testnet)' },
  devnet: { label: 'Devnet', color: 'vx-network--devnet', dot: 'var(--vx-color-network-devnet)' },
};

export function NetworkBadge({ network = 'mainnet', className = '' }: NetworkBadgeProps) {
  const config = networkConfig[network] || networkConfig.mainnet;

  return (
    <span
      className={`vx-network-badge ${config.color} ${className}`}
      role="status"
      aria-label={`Network: ${config.label}`}
    >
      <span
        className="vx-network-badge__dot"
        style={{ backgroundColor: config.dot }}
        aria-hidden="true"
      />
      <span className="vx-network-badge__label">{config.label}</span>
    </span>
  );
}
