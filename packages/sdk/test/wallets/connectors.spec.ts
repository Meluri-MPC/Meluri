/**
 * Connectors Module Tests — Connector registry, mock wallet providers.
 *
 * Run: npx tsx test/wallets/connectors.spec.ts
 *
 * Coverage:
 *   - Connector registry CRUD
 *   - Leather, Xverse, Asigna connector structure validation
 *   - getConnectors, getConnector, getConnectorsByChain
 *   - getAvailableConnectors, getAvailableConnectorsByChain
 *   - registerConnector (add/update)
 *   - Connector interface compliance
 */

import {
  getConnectors,
  getConnector,
  getConnectorsByChain,
  getAvailableConnectors,
  getAvailableConnectorsByChain,
  registerConnector,
  leatherConnector,
  xverseConnector,
  asignaConnector,
} from '../../src/wallets/connectors';
import type { WalletConnector } from '../../src/wallets/types';

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

function validateConnectorInterface(connector: WalletConnector): void {
  assert(typeof connector.id === 'string' && connector.id.length > 0, `${connector.name} has valid id`);
  assert(typeof connector.name === 'string' && connector.name.length > 0, `${connector.name} has valid name`);
  assert(typeof connector.icon === 'string', `${connector.name} has icon`);
  assert(Array.isArray(connector.chains) && connector.chains.length > 0, `${connector.name} has chains`);
  assert(typeof connector.installUrl === 'string', `${connector.name} has installUrl`);
  assert(typeof connector.supportedNetworks === 'object', `${connector.name} has supportedNetworks`);
  assert(typeof connector.isAvailable === 'function', `${connector.name} has isAvailable`);
  assert(typeof connector.connect === 'function', `${connector.name} has connect`);
  assert(typeof connector.disconnect === 'function', `${connector.name} has disconnect`);
  assert(typeof connector.getProvider === 'function', `${connector.name} has getProvider`);
}

// ─── Connector Structure Validation ──────────────────────────────────

test('Leather connector has all required fields', () => {
  assert(leatherConnector.id === 'leather', 'Leather id correct');
  assert(leatherConnector.name === 'Leather', 'Leather name correct');
  assert(leatherConnector.chains.includes('stacks'), 'Leather supports stacks');
  assert(leatherConnector.chains.includes('bitcoin'), 'Leather supports bitcoin');
  assert(leatherConnector.supportedNetworks.stacks !== undefined, 'Leather has stacks networks');
  assert(leatherConnector.supportedNetworks.bitcoin !== undefined, 'Leather has bitcoin networks');
  validateConnectorInterface(leatherConnector);
});

test('Xverse connector has all required fields', () => {
  assert(xverseConnector.id === 'xverse', 'Xverse id correct');
  assert(xverseConnector.name === 'Xverse', 'Xverse name correct');
  assert(xverseConnector.chains.includes('stacks'), 'Xverse supports stacks');
  assert(xverseConnector.chains.includes('bitcoin'), 'Xverse supports bitcoin');
  validateConnectorInterface(xverseConnector);
});

test('Asigna connector has all required fields', () => {
  assert(asignaConnector.id === 'asigna', 'Asigna id correct');
  assert(asignaConnector.name === 'Asigna', 'Asigna name correct');
  assert(asignaConnector.chains.includes('stacks'), 'Asigna supports stacks');
  assert(asignaConnector.chains.includes('bitcoin'), 'Asigna supports bitcoin');
  validateConnectorInterface(asignaConnector);
});

// ─── Connector Registry ──────────────────────────────────────────────

test('getConnectors returns all connectors', () => {
  const connectors = getConnectors();
  assert(connectors.length >= 3, 'Should have at least 3 connectors');
  const ids = connectors.map((c: WalletConnector) => c.id);
  assert(ids.includes('leather'), 'Should include leather');
  assert(ids.includes('xverse'), 'Should include xverse');
  assert(ids.includes('asigna'), 'Should include asigna');
});

test('getConnector returns correct connector by id', () => {
  const leather = getConnector('leather');
  assert(leather !== undefined, 'Should find leather');
  assert(leather!.id === 'leather', 'Should be leather');
  assert(leather!.name === 'Leather', 'Name should match');

  const xverse = getConnector('xverse');
  assert(xverse !== undefined, 'Should find xverse');

  const asigna = getConnector('asigna');
  assert(asigna !== undefined, 'Should find asigna');
});

test('getConnector returns undefined for unknown id', () => {
  const result = getConnector('nonexistent-wallet');
  assert(result === undefined, 'Should return undefined');
});

test('getConnectorsByChain filters by chain', () => {
  const stacks = getConnectorsByChain('stacks');
  assert(stacks.length >= 3, 'All 3 Stacks wallets should support stacks');
  for (const c of stacks) {
    assert(c.chains.includes('stacks'), `${c.name} should support stacks`);
  }

  const bitcoin = getConnectorsByChain('bitcoin');
  assert(bitcoin.length >= 3, 'All 3 should support bitcoin');
  for (const c of bitcoin) {
    assert(c.chains.includes('bitcoin'), `${c.name} should support bitcoin`);
  }

  const ethereum = getConnectorsByChain('ethereum');
  assert(ethereum.length === 0, 'No built-in ethereum connector yet');
});

test('getConnectorsByChain returns empty for unsupported chains', () => {
  const solana = getConnectorsByChain('solana');
  assert(solana.length === 0, 'No built-in Solana connectors');
});

test('getAvailableConnectors returns only available ones', () => {
  // In test environment, none should be available (no window.LeatherProvider etc.)
  const available = getAvailableConnectors();
  assert(available.length === 0, 'No wallets should be available in test env');
});

test('getAvailableConnectorsByChain returns empty in test env', () => {
  const available = getAvailableConnectorsByChain('stacks');
  assert(available.length === 0, 'No wallets available in test');
});

// ─── Connector Registration ─────────────────────────────────────────

test('registerConnector adds a new connector', () => {
  const customConnector: WalletConnector = {
    id: 'test-wallet',
    name: 'Test Wallet',
    icon: 'test',
    chains: ['ethereum'],
    supportedNetworks: { ethereum: ['mainnet', 'sepolia'] },
    installUrl: 'https://test.com',
    isAvailable() { return true; },
    async connect() {
      return {
        address: '0xtest',
        publicKey: '0xpub',
        chain: 'ethereum',
        network: 'mainnet',
        provider: {} as any,
        connectorId: 'test-wallet',
      };
    },
    async disconnect() {},
    getProvider() { return null; },
  };

  registerConnector(customConnector);

  const found = getConnector('test-wallet');
  assert(found !== undefined, 'Should find custom connector');
  assert(found!.name === 'Test Wallet', 'Name should match');
  assert(found!.chains.includes('ethereum'), 'Should support ethereum');
});

test('registerConnector updates existing connector', () => {
  const original = getConnector('leather');
  assert(original !== undefined, 'Original should exist');

  const updatedLeather: WalletConnector = {
    ...original!,
    name: 'Leather Updated',
  };

  registerConnector(updatedLeather);
  const found = getConnector('leather');
  assert(found!.name === 'Leather Updated', 'Should be updated');
});

test('registerConnector with multi-chain support', () => {
  const multiChain: WalletConnector = {
    id: 'multichain-wallet',
    name: 'MultiChain',
    icon: 'multi',
    chains: ['stacks', 'ethereum', 'solana', 'bitcoin', 'sui', 'aptos'],
    supportedNetworks: {
      stacks: ['mainnet', 'testnet'],
      ethereum: ['mainnet', 'sepolia'],
      solana: ['mainnet-beta', 'devnet'],
      bitcoin: ['mainnet', 'testnet'],
      sui: ['mainnet', 'testnet'],
      aptos: ['mainnet', 'testnet'],
    },
    installUrl: 'https://multichain.example.com',
    isAvailable() { return false; },
    async connect(chain) {
      return {
        address: 'multichain_addr',
        publicKey: 'multichain_pk',
        chain: (chain || 'stacks') as any,
        network: 'mainnet',
        provider: {} as any,
        connectorId: 'multichain-wallet',
      };
    },
    async disconnect() {},
    getProvider() { return null; },
  };

  registerConnector(multiChain);
  const found = getConnector('multichain-wallet');
  assert(found !== undefined, 'Should find multichain connector');
  assert(found!.chains.length === 6, 'Should support all 6 chains');
  assert(found!.supportedNetworks.stacks !== undefined, 'Should have stacks networks');
  assert(found!.supportedNetworks.solana !== undefined, 'Should have solana networks');
  assert(found!.supportedNetworks.sui !== undefined, 'Should have sui networks');
  assert(found!.supportedNetworks.aptos !== undefined, 'Should have aptos networks');
});

// ─── Connector Chain Support ─────────────────────────────────────────

test('All built-in connectors support stacks', () => {
  for (const connector of [leatherConnector, xverseConnector, asignaConnector]) {
    assert(connector.chains.includes('stacks'), `${connector.name} should support stacks`);
  }
});

test('All built-in connectors support bitcoin', () => {
  for (const connector of [leatherConnector, xverseConnector, asignaConnector]) {
    assert(connector.chains.includes('bitcoin'), `${connector.name} should support bitcoin`);
  }
});

test('Each built-in connector has install URL', () => {
  for (const connector of getConnectors()) {
    assert(connector.installUrl.startsWith('http'), `${connector.name} has valid install URL`);
  }
});

test('Connector supported networks are arrays', () => {
  for (const connector of getConnectors()) {
    for (const chain of connector.chains) {
      const networks = connector.supportedNetworks[chain];
      assert(Array.isArray(networks), `${connector.name} networks for ${chain} should be array`);
      assert(networks!.length > 0, `${connector.name} should have at least one network for ${chain}`);
    }
  }
});

// ─── Summary ─────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Connectors Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}, 1000);
