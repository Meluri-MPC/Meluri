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
