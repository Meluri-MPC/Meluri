/**
 * Persistence Module Tests — localStorage persistence, auto-reconnect, session expiry.
 *
 * Run: npx tsx test/wallets/persistence.spec.ts
 *
 * Coverage:
 *   - saveConnection / getConnection round-trip
 *   - Session expiry and expiry refresh
 *   - Connection history (multiple wallets)
 *   - Clear operations
 *   - hasMultipleWallets detection
 *   - getWalletCount
 *   - getLastActiveWallet
 *   - Edge cases: corrupted data, missing storage
 */

import {
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
} from '../../src/wallets/persistence/persistence';
import type { WalletPersistenceData, ConnectResult } from '../../src/wallets/types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  (async () => {
    try {
      await fn();
      passed++;
      console.log(`  \u2713 ${name}`);
    } catch (e: any) {
      failed++;
      console.log(`  \u2717 ${name}`);
      console.log(`    Error: ${e.message}`);
    }
  })();
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Mock localStorage since we're in Node.js
const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem(key: string) { return storage.get(key) ?? null; },
  setItem(key: string, value: string) { storage.set(key, value); },
  removeItem(key: string) { storage.delete(key); },
  clear() { storage.clear(); },
  get length() { return storage.size; },
  key(index: number) { return Array.from(storage.keys())[index] ?? null; },
};

function setup() {
  storage.clear();
}

// ─── Save & Get Connection ────────────────────────────────────────────

test('saveConnection stores wallet data', () => {
  setup();
  const data: WalletPersistenceData = {
    connectorId: 'leather',
    address: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4YARK306',
    chain: 'stacks',
    network: 'mainnet',
    connectedAt: Date.now(),
  };
  saveConnection(data);
  const retrieved = getConnection();
  assert(retrieved !== null, 'Should retrieve saved connection');
  assert(retrieved!.connectorId === 'leather', 'Should preserve connectorId');
  assert(retrieved!.address === 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4YARK306', 'Should preserve address');
  assert(retrieved!.chain === 'stacks', 'Should preserve chain');
  assert(retrieved!.network === 'mainnet', 'Should preserve network');
});

test('saveConnection sets default expiry', () => {
  setup();
  const data: WalletPersistenceData = {
    connectorId: 'xverse',
    address: 'addr',
    chain: 'stacks',
    network: 'testnet',
    connectedAt: Date.now(),
  };
  saveConnection(data);
  const retrieved = getConnection();
  assert(retrieved !== null, 'Should retrieve connection');
  assert(retrieved!.expiresAt !== undefined, 'Should have expiry');
  assert(retrieved!.expiresAt! > Date.now(), 'Expiry should be in the future');
});

test('saveConnection respects custom expiry', () => {
  setup();
  const data: WalletPersistenceData = {
    connectorId: 'leather',
    address: 'addr',
    chain: 'stacks',
    network: 'mainnet',
    connectedAt: Date.now(),
  };
  saveConnection(data, { sessionExpiry: 1000 });
  const retrieved = getConnection();
  assert(retrieved !== null, 'Should retrieve connection');
  assert(retrieved!.expiresAt! <= Date.now() + 1000, 'Should respect custom expiry');
});

test('getConnection returns null for empty storage', () => {
  setup();
  const result = getConnection();
  assert(result === null, 'Should return null when nothing saved');
});

test('getConnection returns null for expired session', () => {
  setup();
  const data: WalletPersistenceData = {
    connectorId: 'leather',
    address: 'addr',
    chain: 'stacks',
    network: 'mainnet',
    connectedAt: Date.now() - 100000,
    expiresAt: Date.now() - 1000,
  };
  saveConnection(data);
  const result = getConnection();
  assert(result === null, 'Should return null for expired session');
});

test('getConnection preserves non-expired session', () => {
  setup();
  const data: WalletPersistenceData = {
    connectorId: 'xverse',
    address: 'addr_x',
    chain: 'bitcoin',
    network: 'mainnet',
    connectedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };
  saveConnection(data);
  const result = getConnection();
  assert(result !== null, 'Should return non-expired session');
  assert(result!.connectorId === 'xverse', 'Should return correct connector');
});

// ─── Connection History ──────────────────────────────────────────────

test('getConnectionHistory returns empty initially', () => {
  setup();
  const history = getConnectionHistory();
  assert(Array.isArray(history), 'Should return array');
  assert(history.length === 0, 'Should be empty initially');
});

test('getConnectionHistory stores multiple wallets', () => {
  setup();
  saveConnection({ connectorId: 'leather', address: 'addr1', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  saveConnection({ connectorId: 'xverse', address: 'addr2', chain: 'bitcoin', network: 'mainnet', connectedAt: Date.now() });
  saveConnection({ connectorId: 'asigna', address: 'addr3', chain: 'stacks', network: 'testnet', connectedAt: Date.now() });
  const history = getConnectionHistory();
  assert(history.length === 3, 'Should have 3 entries');
});

test('getConnectionHistory orders by most recent', () => {
  setup();
  saveConnection({ connectorId: 'leather', address: 'old', chain: 'stacks', network: 'mainnet', connectedAt: 1000 });
  saveConnection({ connectorId: 'xverse', address: 'new', chain: 'stacks', network: 'mainnet', connectedAt: 2000 });
  const history = getConnectionHistory();
  assert(history[0].connectorId === 'xverse', 'Most recent should be first');
  assert(history[1].connectorId === 'leather', 'Older should be second');
});

test('getConnectionHistory deduplicates by connector and address', () => {
  setup();
  saveConnection({ connectorId: 'leather', address: 'addr1', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  saveConnection({ connectorId: 'leather', address: 'addr1', chain: 'stacks', network: 'testnet', connectedAt: Date.now() });
  const history = getConnectionHistory();
  assert(history.length === 1, 'Should deduplicate same connector+address');
  assert(history[0].network === 'testnet', 'Should keep latest entry');
});

test('getConnectionHistory respects maxHistorySize', () => {
  setup();
  for (let i = 0; i < 20; i++) {
    saveConnection(
      { connectorId: `wallet_${i}`, address: `addr_${i}`, chain: 'stacks', network: 'mainnet', connectedAt: Date.now() },
      { maxHistorySize: 5 }
    );
  }
  const history = getConnectionHistory();
  assert(history.length === 5, 'Should cap at max size');
});

// ─── Clear Operations ────────────────────────────────────────────────

test('clearConnection removes current connection', () => {
  setup();
  saveConnection({ connectorId: 'leather', address: 'addr', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  clearConnection();
  assert(getConnection() === null, 'Should clear current connection');
});

test('clearConnectionHistory removes history only', () => {
  setup();
  saveConnection({ connectorId: 'leather', address: 'addr', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  clearConnectionHistory();
  assert(getConnection() !== null, 'Current connection should persist');
  assert(getConnectionHistory().length === 0, 'History should be cleared');
});

test('clearAllConnections removes everything', () => {
  setup();
  saveConnection({ connectorId: 'leather', address: 'addr', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  clearAllConnections();
  assert(getConnection() === null, 'Current should be cleared');
  assert(getConnectionHistory().length === 0, 'History should be cleared');
});

// ─── Session Expiry ──────────────────────────────────────────────────

test('isConnectionExpired returns true for null', () => {
  assert(isConnectionExpired(null) === true, 'Null should be expired');
});

test('isConnectionExpired returns false for non-expired', () => {
  const data: WalletPersistenceData = {
    connectorId: 'leather',
    address: 'addr',
    chain: 'stacks',
    network: 'mainnet',
    connectedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };
  assert(isConnectionExpired(data) === false, 'Should not be expired');
});

test('isConnectionExpired returns true for expired', () => {
  const data: WalletPersistenceData = {
    connectorId: 'leather',
    address: 'addr',
    chain: 'stacks',
    network: 'mainnet',
    connectedAt: Date.now() - 10000,
    expiresAt: Date.now() - 1000,
  };
  assert(isConnectionExpired(data) === true, 'Should be expired');
});

test('isConnectionExpired returns false for no expiry', () => {
  const data: WalletPersistenceData = {
    connectorId: 'leather',
    address: 'addr',
    chain: 'stacks',
    network: 'mainnet',
    connectedAt: Date.now(),
  };
  assert(isConnectionExpired(data) === false, 'No expiry means never expires');
});

test('refreshConnectionExpiry extends expiry', () => {
  setup();
  const oldExpiry = Date.now() - 1000;
  saveConnection({
    connectorId: 'leather',
    address: 'addr',
    chain: 'stacks',
    network: 'mainnet',
    connectedAt: Date.now(),
    expiresAt: oldExpiry,
  });
  refreshConnectionExpiry();
  const retrieved = getConnection();
  assert(retrieved !== null, 'Should retrieve after refresh');
  assert(retrieved!.expiresAt! > Date.now(), 'Expiry should be extended');
});

// ─── Wallet Count and Multi-Wallet ────────────────────────────────────

test('getWalletCount returns correct count', () => {
  setup();
  assert(getWalletCount() === 0, 'Should be 0 initially');
  saveConnection({ connectorId: 'leather', address: 'a1', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  saveConnection({ connectorId: 'xverse', address: 'a2', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  assert(getWalletCount() === 2, 'Should be 2 after adding');
});

test('hasMultipleWallets detects multiple', () => {
  setup();
  assert(hasMultipleWallets() === false, 'Should be false with 0 wallets');
  saveConnection({ connectorId: 'leather', address: 'a1', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  assert(hasMultipleWallets() === false, 'Should be false with 1 wallet');
  saveConnection({ connectorId: 'xverse', address: 'a2', chain: 'bitcoin', network: 'mainnet', connectedAt: Date.now() });
  assert(hasMultipleWallets() === true, 'Should be true with 2 wallets');
});

test('getLastActiveWallet returns most recent', () => {
  setup();
  saveConnection({ connectorId: 'leather', address: 'first', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  saveConnection({ connectorId: 'xverse', address: 'last', chain: 'stacks', network: 'testnet', connectedAt: Date.now() });
  const last = getLastActiveWallet();
  assert(last !== undefined, 'Should return last wallet');
  assert(last!.connectorId === 'xverse', 'Should be most recent');
});

test('getLastActiveWallet returns undefined when empty', () => {
  setup();
  assert(getLastActiveWallet() === undefined, 'Should be undefined');
});

// ─── Auto-Reconnect ──────────────────────────────────────────────────

test('autoReconnect returns null when no saved connection', async () => {
  setup();
  let called = false;
  const result = await autoReconnect(async () => {
    called = true;
    return {} as ConnectResult;
  });
  assert(result === null, 'Should return null');
  assert(called === false, 'Should not call connectFn');
});

test('autoReconnect calls connectFn with saved data', async () => {
  setup();
  saveConnection({
    connectorId: 'leather',
    address: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4YARK306',
    chain: 'stacks',
    network: 'mainnet',
    connectedAt: Date.now(),
  });

  let receivedConnector = '';
  let receivedChain = '';
  let receivedAddress = '';

  const result = await autoReconnect(async (connectorId, chain, address) => {
    receivedConnector = connectorId;
    receivedChain = chain;
    receivedAddress = address || '';
    return {
      address: address || '',
      publicKey: 'pk',
      chain: chain as any,
      network: 'mainnet',
      provider: {} as any,
      connectorId,
    };
  });

  assert(receivedConnector === 'leather', 'Should pass connectorId');
  assert(receivedChain === 'stacks', 'Should pass chain');
  assert(receivedAddress === 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4YARK306', 'Should pass address');
});

test('autoReconnect returns null on connect failure', async () => {
  setup();
  saveConnection({
    connectorId: 'xverse',
    address: 'addr',
    chain: 'stacks',
    network: 'mainnet',
    connectedAt: Date.now(),
  });

  const result = await autoReconnect(async () => {
    throw new Error('Connection failed');
  });
  assert(result === null, 'Should return null on failure');
});

// ─── Multi-Chain Persistence ─────────────────────────────────────────

test('persists connections for different chains', () => {
  setup();
  saveConnection({ connectorId: 'leather', address: 'stacks_addr', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  saveConnection({ connectorId: 'metamask', address: '0x_eth_addr', chain: 'ethereum', network: 'mainnet', connectedAt: Date.now() });
  saveConnection({ connectorId: 'phantom', address: 'sol_addr', chain: 'solana', network: 'mainnet-beta', connectedAt: Date.now() });

  const history = getConnectionHistory();
  assert(history.length === 3, 'Should have 3 connections');
  const chains = history.map((h: WalletPersistenceData) => h.chain);
  assert(chains.includes('stacks'), 'Should include stacks');
  assert(chains.includes('ethereum'), 'Should include ethereum');
  assert(chains.includes('solana'), 'Should include solana');
});

// ─── Edge Cases ──────────────────────────────────────────────────────

test('handles corrupted localStorage gracefully', () => {
  setup();
  storage.set('velumx_wallet_connection', 'not-valid-json{{{');
  const result = getConnection();
  assert(result === null, 'Should handle corrupted data');
});

test('handles corrupted history gracefully', () => {
  setup();
  storage.set('velumx_wallet_history', '{corrupt:true,');
  const result = getConnectionHistory();
  assert(result.length === 0, 'Should return empty on corruption');
});

test('handles missing storage gracefully', () => {
  // Remove storage
  const oldStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = undefined;
  try {
    const result = getConnection();
    assert(result === null, 'Should handle missing storage');
    clearConnection();
    saveConnection({ connectorId: 'test', address: 'a', chain: 'stacks', network: 'mainnet', connectedAt: Date.now() });
  } finally {
    (globalThis as any).localStorage = oldStorage;
  }
});

// ─── Summary ─────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Persistence Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}, 1000);
