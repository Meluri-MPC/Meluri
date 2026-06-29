import type { ChainType, WalletPersistenceData, ConnectResult } from '../types';

const PERSISTENCE_KEY = 'velumx_wallet_connection';
const PERSISTENCE_HISTORY_KEY = 'velumx_wallet_history';
const DEFAULT_SESSION_EXPIRY = 24 * 60 * 60 * 1000;

export interface PersistenceConfig {
  autoConnect?: boolean;
  sessionExpiry?: number;
  maxHistorySize?: number;
}

export function saveConnection(
  data: WalletPersistenceData,
  config?: PersistenceConfig
): void {
  try {
    const withExpiry: WalletPersistenceData = {
      ...data,
      connectedAt: data.connectedAt || Date.now(),
      expiresAt: data.expiresAt || Date.now() + (config?.sessionExpiry || DEFAULT_SESSION_EXPIRY),
    };
    localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(withExpiry));
    saveToHistory(data, config);
  } catch {}
}

function saveToHistory(data: WalletPersistenceData, config?: PersistenceConfig): void {
  try {
    const raw = localStorage.getItem(PERSISTENCE_HISTORY_KEY);
    let history: WalletPersistenceData[] = raw ? JSON.parse(raw) : [];
    history = history.filter((h) => h.connectorId !== data.connectorId || h.address !== data.address);
    history.unshift(data);
    const maxSize = config?.maxHistorySize || 10;
    if (history.length > maxSize) history = history.slice(0, maxSize);
    localStorage.setItem(PERSISTENCE_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

export function getConnection(): WalletPersistenceData | null {
  try {
    const raw = localStorage.getItem(PERSISTENCE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as WalletPersistenceData;
    if (data.expiresAt && Date.now() > data.expiresAt) {
      clearConnection();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function getConnectionHistory(): WalletPersistenceData[] {
  try {
    const raw = localStorage.getItem(PERSISTENCE_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WalletPersistenceData[];
  } catch {
    return [];
  }
}

export function clearConnection(): void {
  try {
    localStorage.removeItem(PERSISTENCE_KEY);
  } catch {}
}

export function clearConnectionHistory(): void {
  try {
    localStorage.removeItem(PERSISTENCE_HISTORY_KEY);
  } catch {}
}

export function clearAllConnections(): void {
  clearConnection();
  clearConnectionHistory();
}

export function isConnectionExpired(data?: WalletPersistenceData | null): boolean {
  if (!data) return true;
  if (!data.expiresAt) return false;
  return Date.now() > data.expiresAt;
}

export function refreshConnectionExpiry(config?: PersistenceConfig): void {
  try {
    const raw = localStorage.getItem(PERSISTENCE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as WalletPersistenceData;
    data.expiresAt = Date.now() + (config?.sessionExpiry || DEFAULT_SESSION_EXPIRY);
    data.connectedAt = Date.now();
    localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(data));
  } catch {}
}

export async function autoReconnect(
  connectFn: (connectorId: string, chain: ChainType, address?: string) => Promise<ConnectResult>
): Promise<ConnectResult | null> {
  const saved = getConnection();
  if (!saved) return null;

  try {
    const result = await connectFn(saved.connectorId, saved.chain, saved.address);
    if (result) {
      saveConnection({
        connectorId: saved.connectorId,
        address: result.address,
        chain: saved.chain,
        network: result.network,
        connectedAt: Date.now(),
      });
    }
    return result;
  } catch {
    return null;
  }
}

export function getWalletCount(): number {
  return getConnectionHistory().length;
}

export function getLastActiveWallet(): WalletPersistenceData | undefined {
  const history = getConnectionHistory();
  return history[0];
}

export function hasMultipleWallets(): boolean {
  return getConnectionHistory().length > 1;
}
