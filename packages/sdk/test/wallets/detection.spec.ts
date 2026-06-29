/**
 * Provider Detection Tests — Window scanning, injected provider detection.
 *
 * Run: npx tsx test/wallets/detection.spec.ts
 *
 * Coverage:
 *   - hasProvider checks
 *   - detectProviders with connector list
 *   - detectChainProviders per chain
 *   - Preferred wallet ranking
 *   - Multi-chain detection
 */

import { hasProvider, detectProviders, detectChainProviders } from '../../src/wallets/detection';
import {
  leatherConnector,
  xverseConnector,
  asignaConnector,
  registerConnector,
} from '../../src/wallets/connectors';
import type { WalletConnector, WalletConnectionConfig, ChainType } from '../../src/wallets/types';

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

// Store original window state
const origWindow = globalThis as any;

function setupWindow(providers: Record<string, unknown>) {
  (globalThis as any).window = { ...providers };
}

function teardownWindow() {
  delete (globalThis as any).window;
}

// ─── hasProvider ──────────────────────────────────────────────────────

test('hasProvider returns false when no window', () => {
  teardownWindow();
  assert(hasProvider('leather') === false, 'Should return false without window');
  assert(hasProvider('xverse') === false, 'Should return false without window');
});

test('hasProvider returns false for unknown provider id', () => {
  assert(hasProvider('nonexistent') === false, 'Unknown provider should be false');
});

test('hasProvider returns false when provider not injected', () => {
  setupWindow({});
  assert(hasProvider('leather') === false, 'Should return false when Leather not injected');
  assert(hasProvider('xverse') === false, 'Should return false when Xverse not injected');
  teardownWindow();
});

test('hasProvider returns true when LeatherProvider present', () => {
  setupWindow({ LeatherProvider: { isMock: true } });
  assert(hasProvider('leather') === true, 'Should detect Leather');
  teardownWindow();
});

test('hasProvider returns true when XverseProvider present', () => {
  setupWindow({ XverseProvider: { isMock: true } });
  assert(hasProvider('xverse') === true, 'Should detect Xverse');
  teardownWindow();
});

test('hasProvider returns true when AsignaProvider present', () => {
  setupWindow({ AsignaProvider: { isMock: true } });
  assert(hasProvider('asigna') === true, 'Should detect Asigna');
  teardownWindow();
});

test('hasProvider detects Phantom', () => {
  setupWindow({ phantom: { solana: { isPhantom: true } } });
  assert(hasProvider('phantom') === true, 'Should detect Phantom');
  teardownWindow();
});

test('hasProvider detects Petra', () => {
  setupWindow({ petra: { isPetra: true } });
  assert(hasProvider('petra') === true, 'Should detect Petra');
  teardownWindow();
});

// ─── detectProviders ─────────────────────────────────────────────────

function createDetectableConnector(id: string, name: string, available: boolean): WalletConnector {
  return {
    id,
    name,
    icon: id,
    chains: ['stacks', 'bitcoin'],
    supportedNetworks: { stacks: ['mainnet'], bitcoin: ['mainnet'] },
    installUrl: `https://${id}.com`,
    isAvailable() { return available; },
    async connect() {
      return { address: 'addr', publicKey: 'pk', chain: 'stacks', network: 'mainnet', provider: {} as any, connectorId: id };
    },
    async disconnect() {},
    getProvider() { return null; },
  };
}

test('detectProviders returns only available connectors', () => {
  const connectors = [
    createDetectableConnector('wallet-a', 'Wallet A', true),
    createDetectableConnector('wallet-b', 'Wallet B', false),
    createDetectableConnector('wallet-c', 'Wallet C', true),
  ];

  const detected = detectProviders(connectors);
  assert(detected.length === 2, 'Should detect 2 available wallets');
  assert(detected[0].id === 'wallet-a', 'First should be wallet-a');
  assert(detected[1].id === 'wallet-c', 'Second should be wallet-c');
});

test('detectProviders returns empty for all unavailable', () => {
  const connectors = [
    createDetectableConnector('a', 'A', false),
    createDetectableConnector('b', 'B', false),
  ];
  const detected = detectProviders(connectors);
  assert(detected.length === 0, 'Should return empty');
});

test('detectProviders returns empty for empty connector list', () => {
  const detected = detectProviders([]);
  assert(detected.length === 0, 'Empty list gives empty result');
});

test('detectProviders with preferred wallet config marks default', () => {
  const connectors = [
    createDetectableConnector('wallet-a', 'Wallet A', true),
    createDetectableConnector('wallet-b', 'Wallet B', true),
  ];

  const config: WalletConnectionConfig = { preferredWallets: ['wallet-b'] };
  const detected = detectProviders(connectors, config);
  assert(detected.length === 2, 'Should detect both');
  assert(detected[0].id === 'wallet-b', 'Preferred wallet should be first');
  assert(detected[0].isDefault === true, 'Preferred wallet should be default');
});

test('detectProviders preferred wallet not available still sorts', () => {
  const connectors = [
    createDetectableConnector('wallet-a', 'Wallet A', true),
  ];

  const config: WalletConnectionConfig = { preferredWallets: ['wallet-b'] };
  const detected = detectProviders(connectors, config);
  assert(detected.length === 1, 'Should detect one wallet');
  assert(detected[0].id === 'wallet-a', 'Available wallet still shows');
  assert(detected[0].isDefault === false, 'Should not be default if not preferred');
});

// ─── detectChainProviders ────────────────────────────────────────────

test('detectChainProviders for stacks with Leather', () => {
  setupWindow({ LeatherProvider: { isMock: true } });
  const providers = detectChainProviders('stacks');
  assert(providers.length >= 1, 'Should have at least one provider');
  assert(providers.some(p => p.id === 'leather'), 'Should include leather for stacks');
  teardownWindow();
});

test('detectChainProviders for stacks with Xverse', () => {
  setupWindow({ XverseProvider: { isMock: true } });
  const providers = detectChainProviders('stacks');
  assert(providers.some(p => p.id === 'xverse'), 'Should include xverse for stacks');
  teardownWindow();
});

test('detectChainProviders for stacks with Asigna', () => {
  setupWindow({ AsignaProvider: { isMock: true } });
  const providers = detectChainProviders('stacks');
  assert(providers.some(p => p.id === 'asigna'), 'Should include asigna for stacks');
  teardownWindow();
});

test('detectChainProviders for bitcoin with Leather and Xverse', () => {
  setupWindow({ LeatherProvider: {}, XverseProvider: {} });
  const providers = detectChainProviders('bitcoin');
  assert(providers.some(p => p.id === 'leather'), 'Bitcoin should include leather');
  assert(providers.some(p => p.id === 'xverse'), 'Bitcoin should include xverse');
  teardownWindow();
});

test('detectChainProviders for ethereum', () => {
  setupWindow({ ethereum: { isMetaMask: true } });
  const providers = detectChainProviders('ethereum');
  assert(providers.some(p => p.id === 'metamask'), 'Ethereum should find MetaMask');
  teardownWindow();
});

test('detectChainProviders for solana with Phantom', () => {
  setupWindow({ phantom: { solana: { isPhantom: true } } });
  const providers = detectChainProviders('solana');
  assert(providers.some(p => p.id === 'phantom'), 'Solana should find Phantom');
  teardownWindow();
});

test('detectChainProviders for sui', () => {
  setupWindow({ martian: { isMartian: true } });
  const providers = detectChainProviders('sui');
  assert(providers.some(p => p.id === 'martian'), 'Sui should find Martian');
  teardownWindow();
});

test('detectChainProviders for aptos', () => {
  setupWindow({ petra: { isPetra: true } });
  const providers = detectChainProviders('aptos');
  assert(providers.some(p => p.id === 'petra'), 'Aptos should find Petra');
  teardownWindow();
});

test('detectChainProviders returns empty when nothing detected', () => {
  setupWindow({});
  const providers = detectChainProviders('stacks');
  assert(providers.length === 0, 'Should return empty when no providers');
  teardownWindow();
});

test('detectChainProviders returns empty when window undefined', () => {
  teardownWindow();
  const providers = detectChainProviders('stacks');
  assert(providers.length === 0, 'Should handle missing window');
});

// ─── Multi-Chain Detection ──────────────────────────────────────────

test('detectChainProviders for stacks shows Leather + Xverse + Asigna together', () => {
  setupWindow({
    LeatherProvider: {},
    XverseProvider: {},
    AsignaProvider: {},
  });
  const providers = detectChainProviders('stacks');
  const ids = providers.map(p => p.id);
  assert(ids.includes('leather'), 'Should detect leather');
  assert(ids.includes('xverse'), 'Should detect xverse');
  assert(ids.includes('asigna'), 'Should detect asigna');
  teardownWindow();
});

test('detectChainProviders works for all supported chains', () => {
  const testCases: Array<{ chain: ChainType; providers: Record<string, unknown>; expected: string[] }> = [
    { chain: 'stacks', providers: { LeatherProvider: {} }, expected: ['leather'] },
    { chain: 'bitcoin', providers: { XverseProvider: {} }, expected: ['xverse'] },
    { chain: 'ethereum', providers: { ethereum: {} }, expected: ['metamask'] },
    { chain: 'solana', providers: { phantom: { solana: {} } }, expected: ['phantom'] },
    { chain: 'sui', providers: { martian: {} }, expected: ['martian'] },
    { chain: 'aptos', providers: { petra: {} }, expected: ['petra'] },
  ];

  for (const { chain, providers: p, expected } of testCases) {
    setupWindow(p);
    const detected = detectChainProviders(chain);
    const ids = detected.map(d => d.id);
    for (const exp of expected) {
      assert(ids.includes(exp), `Chain ${chain} should detect ${exp}`);
    }
    teardownWindow();
  }
});

// ─── DetectedProvider Structure ──────────────────────────────────────

test('DetectedProvider has correct structure', () => {
  setupWindow({ LeatherProvider: {} });
  const providers = detectChainProviders('stacks');
  const leather = providers.find(p => p.id === 'leather');
  assert(leather !== undefined, 'Should find leather');
  assert(leather!.id === 'leather', 'Should have id');
  assert(leather!.name === 'Leather', 'Should have name');
  assert(leather!.chains.includes('stacks'), 'Should have chains');
  assert(leather!.chains.includes('bitcoin'), 'Should support bitcoin too');
  assert(leather!.provider !== undefined, 'Should have provider reference');
  teardownWindow();
});

// ─── Summary ─────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Detection Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}, 1000);
