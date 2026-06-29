export * from './types';
export * from './detection';
export * from './events';

export {
  getConnectors,
  getConnector,
  getConnectorsByChain,
  getAvailableConnectors,
  getAvailableConnectorsByChain,
  registerConnector,
  leatherConnector,
  xverseConnector,
  asignaConnector,
} from './connectors';

export {
  showWalletDiscoveryModal,
  getWalletList,
  createWalletHtml,
  injectModalStyles,
  getWalletMetadata,
  getRememberChoice,
  setRememberChoice,
} from './discovery';
export type { WalletDiscoveryResult } from './discovery';
export type { WalletListItem } from './discovery';

export {
  signMessage,
  signStructuredData,
  signTransaction,
  hashMessage,
  hashStructuredData,
  buildBip191Message,
  verifyMessageSignature,
  verifyStructuredSignature,
  verifyTransactionSignature,
} from './signing';
export type { VerificationResult } from './signing';

export {
  detectNetwork,
  switchNetwork,
  checkNetworkMismatch,
  getDefaultNetwork,
  isValidNetwork,
  getSupportedNetworks,
  parseNetwork,
} from './network';
export type { NetworkInfo, NetworkSwitchResult } from './network';

export {
  saveConnection,
  getConnection,
  getConnectionHistory,
  clearConnection,
  clearConnectionHistory,
  clearAllConnections,
  isConnectionExpired,
  refreshConnectionExpiry,
  autoReconnect,
  getWalletCount,
  getLastActiveWallet,
  hasMultipleWallets,
} from './persistence';
export type { PersistenceConfig } from './persistence';
