/**
 * Network Module Tests — Network detection, switching, mismatch warnings.
 *
 * Run: npx tsx test/wallets/network.spec.ts
 *
 * Coverage:
 *   - parseNetwork across all chains
 *   - detectNetwork with mock provider
 *   - switchNetwork with and without programmatic support
 *   - Network mismatch warnings
 *   - getDefaultNetwork per chain
 *   - isValidNetwork validation
 *   - getSupportedNetworks listing
 */

import {
  parseNetwork,
  detectNetwork,
  switchNetwork,
  checkNetworkMismatch,
  getDefaultNetwork,
  isValidNetwork,
  getSupportedNetworks,
  NetworkInfo,
} from '../../src/wallets/network/network';
import type { WalletProvider } from '../../src/wallets/types';

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

function mockProvider(network: string, supportsSwitch = false): WalletProvider {
  return {
    async getAddresses() { return ['ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4YARK306']; },
    async signMessage(msg: string) { return 'sig_mock'; },
    async signTransaction(tx: unknown) { return 'tx_sig_mock'; },
    async signStructuredData(d: unknown, t: unknown, m: unknown) { return 'structured_sig_mock'; },
    async getNetwork() { return network; },
    async switchNetwork(n: string) {
      if (!supportsSwitch) throw new Error('Unsupported');
    },
    on(e: string, cb: (...args: unknown[]) => void) {},
    off(e: string, cb: (...args: unknown[]) => void) {},
    isConnected() { return true; },
  };
}

// ─── parseNetwork ────────────────────────────────────────────────────

test('parseNetwork identifies mainnet correctly', () => {
  const result = parseNetwork('mainnet', 'stacks');
  assert(result.network === 'mainnet', 'Should normalize to mainnet');
  assert(result.isMainnet === true, 'Should be mainnet');
  assert(result.isTestnet === false, 'Should not be testnet');
  assert(result.chain === 'stacks', 'Should preserve chain');
});

test('parseNetwork identifies testnet correctly', () => {
  const result = parseNetwork('testnet', 'stacks');
  assert(result.isTestnet === true, 'Should be testnet');
  assert(result.isMainnet === false, 'Should not be mainnet');
});

test('parseNetwork handles devnet', () => {
  const result = parseNetwork('devnet', 'stacks');
  assert(result.isTestnet === true, 'Should treat devnet as testnet variant');
});

test('parseNetwork handles mocknet', () => {
  const result = parseNetwork('mocknet', 'stacks');
  assert(result.isTestnet === true, 'Should treat mocknet as testnet variant');
});

test('parseNetwork is case-insensitive', () => {
  const upper = parseNetwork('MAINNET', 'stacks');
  const mixed = parseNetwork('MainNet', 'stacks');
  assert(upper.network === 'mainnet', 'Should lowercase uppercase input');
  assert(mixed.network === 'mainnet', 'Should lowercase mixed case input');
});

test('parseNetwork with bitcoin mainnet', () => {
  const result = parseNetwork('mainnet', 'bitcoin');
  assert(result.isMainnet === true, 'Bitcoin mainnet should be mainnet');
});

test('parseNetwork with bitcoin testnet', () => {
  const result = parseNetwork('testnet', 'bitcoin');
  assert(result.isTestnet === true, 'Bitcoin testnet should be testnet');
});

test('parseNetwork with bitcoin regtest', () => {
  const result = parseNetwork('regtest', 'bitcoin');
  assert(result.isTestnet === true, 'Regtest should be testnet variant');
});

test('parseNetwork with bitcoin signet', () => {
  const result = parseNetwork('signet', 'bitcoin');
  assert(result.isTestnet === true, 'Signet should be testnet variant');
});

test('parseNetwork with ethereum mainnet', () => {
  const result = parseNetwork('mainnet', 'ethereum');
  assert(result.isMainnet === true, 'Ethereum mainnet should be mainnet');
});

test('parseNetwork with ethereum sepolia', () => {
  const result = parseNetwork('sepolia', 'ethereum');
  assert(result.isTestnet === true, 'Sepolia should be testnet');
});

test('parseNetwork with ethereum holesky', () => {
  const result = parseNetwork('holesky', 'ethereum');
  assert(result.isTestnet === true, 'Holesky should be testnet');
});

test('parseNetwork with solana mainnet-beta', () => {
  const result = parseNetwork('mainnet-beta', 'solana');
  assert(result.isMainnet === true, 'Solana mainnet-beta should be mainnet');
});

test('parseNetwork with solana devnet', () => {
  const result = parseNetwork('devnet', 'solana');
  assert(result.isTestnet === true, 'Solana devnet should be testnet');
});

test('parseNetwork with sui networks', () => {
  const mainnet = parseNetwork('mainnet', 'sui');
  const testnet = parseNetwork('testnet', 'sui');
  assert(mainnet.isMainnet === true, 'Sui mainnet should be mainnet');
  assert(testnet.isTestnet === true, 'Sui testnet should be testnet');
});

test('parseNetwork with aptos networks', () => {
  const mainnet = parseNetwork('mainnet', 'aptos');
  const devnet = parseNetwork('devnet', 'aptos');
  assert(mainnet.isMainnet === true, 'Aptos mainnet should be mainnet');
  assert(devnet.isTestnet === true, 'Aptos devnet should be testnet');
});

test('parseNetwork handles unknown networks gracefully', () => {
  const result = parseNetwork('unknown-chain', 'stacks');
  assert(result.network === 'unknown-chain', 'Should pass through unknown network');
});

test('parseNetwork detects mainnet-like unknown names', () => {
  const result = parseNetwork('custom-mainnet', 'stacks');
  assert(result.isMainnet === true, 'Should detect mainnet in name');
});

// ─── detectNetwork ───────────────────────────────────────────────────

test('detectNetwork reads from provider', async () => {
  const provider = mockProvider('testnet');
  const result = await detectNetwork(provider, 'stacks');
  assert(result.network === 'testnet', 'Should detect testnet from provider');
  assert(result.isTestnet === true, 'Should identify as testnet');
});

test('detectNetwork with default chain', async () => {
  const provider = mockProvider('mainnet');
  const result = await detectNetwork(provider);
  assert(result.network === 'mainnet', 'Should default to stacks chain');
});

test('detectNetwork with bitcoin provider', async () => {
  const provider = mockProvider('testnet');
  const result = await detectNetwork(provider, 'bitcoin');
  assert(result.network === 'testnet', 'Should work with bitcoin chain');
});

// ─── switchNetwork ───────────────────────────────────────────────────

test('switchNetwork no-op when already on target network', async () => {
  const provider = mockProvider('mainnet');
  const result = await switchNetwork(provider, 'mainnet', 'stacks');
  assert(result.success === true, 'Should succeed (no-op)');
  assert(result.fallbackUsed === false, 'Should not use fallback');
});

test('switchNetwork uses fallback when unsupported', async () => {
  const provider = mockProvider('mainnet', false);
  const result = await switchNetwork(provider, 'testnet', 'stacks');
  assert(result.success === false, 'Should fail');
  assert(result.fallbackUsed === true, 'Should use fallback');
  assert(result.message !== undefined, 'Should provide message');
});

test('switchNetwork handles supported switch failure', async () => {
  let switchCalled = false;
  const provider: WalletProvider = {
    async getAddresses() { return ['addr']; },
    async signMessage(m: string) { return 'sig'; },
    async signTransaction(t: unknown) { return 'tx'; },
    async signStructuredData(d: unknown, t: unknown, m: unknown) { return 'sig'; },
    async getNetwork() { return 'mainnet'; },
    async switchNetwork(n: string) { throw new Error('User rejected'); },
    on() {},
    off() {},
    isConnected() { return true; },
  };
  const result = await switchNetwork(provider, 'testnet', 'stacks');
  assert(result.success === false, 'Should fail when switch throws');
  assert(result.fallbackUsed === true, 'Should fallback on error');
  assert(result.message !== undefined, 'Should have error message');
});

// ─── checkNetworkMismatch ────────────────────────────────────────────

test('checkNetworkMismatch detects no mismatch', () => {
  const result = checkNetworkMismatch('mainnet', 'mainnet', 'stacks');
  assert(result.mismatch === false, 'Should detect no mismatch');
});

test('checkNetworkMismatch detects mismatch', () => {
  const result = checkNetworkMismatch('testnet', 'mainnet', 'stacks');
  assert(result.mismatch === true, 'Should detect mismatch');
  assert(result.warning !== undefined, 'Should provide warning');
});

test('checkNetworkMismatch includes chain in warning', () => {
  const result = checkNetworkMismatch('testnet', 'mainnet', 'bitcoin');
  assert(result.warning!.includes('bitcoin'), 'Warning should mention chain');
});

// ─── getDefaultNetwork ───────────────────────────────────────────────

test('getDefaultNetwork returns correct default per chain', () => {
  assert(getDefaultNetwork('stacks') === 'mainnet', 'Stacks default');
  assert(getDefaultNetwork('bitcoin') === 'mainnet', 'Bitcoin default');
  assert(getDefaultNetwork('ethereum') === 'mainnet', 'Ethereum default');
  assert(getDefaultNetwork('solana') === 'mainnet-beta', 'Solana default');
  assert(getDefaultNetwork('sui') === 'mainnet', 'Sui default');
  assert(getDefaultNetwork('aptos') === 'mainnet', 'Aptos default');
});

// ─── isValidNetwork ──────────────────────────────────────────────────

test('isValidNetwork validates known networks', () => {
  assert(isValidNetwork('mainnet', 'stacks') === true, 'mainnet is valid for stacks');
  assert(isValidNetwork('testnet', 'stacks') === true, 'testnet is valid for stacks');
  assert(isValidNetwork('devnet', 'stacks') === true, 'devnet is valid for stacks');
  assert(isValidNetwork('sepolia', 'ethereum') === true, 'sepolia is valid for ethereum');
  assert(isValidNetwork('devnet', 'solana') === true, 'devnet is valid for solana');
});

test('isValidNetwork rejects invalid networks', () => {
  assert(isValidNetwork('fantasy-network', 'stacks') === false, 'Unknown network rejected');
  assert(isValidNetwork('mainnet', 'solana') === false, 'mainnet not valid for solana (use mainnet-beta)');
});

// ─── getSupportedNetworks ────────────────────────────────────────────

test('getSupportedNetworks returns list per chain', () => {
  const stacksNetworks = getSupportedNetworks('stacks');
  assert(stacksNetworks.includes('mainnet'), 'Should include mainnet');
  assert(stacksNetworks.includes('testnet'), 'Should include testnet');
  assert(stacksNetworks.length >= 3, 'Should have multiple networks');

  const bitcoinNetworks = getSupportedNetworks('bitcoin');
  assert(bitcoinNetworks.includes('mainnet'), 'Bitcoin should have mainnet');
  assert(bitcoinNetworks.includes('signet'), 'Bitcoin should have signet');
  assert(bitcoinNetworks.length >= 4, 'Bitcoin should have 4 networks');
});

test('getSupportedNetworks all chains return non-empty', () => {
  for (const chain of ['stacks', 'bitcoin', 'ethereum', 'solana', 'sui', 'aptos'] as const) {
    const networks = getSupportedNetworks(chain);
    assert(networks.length > 0, `${chain} should have supported networks`);
  }
});

// ─── Summary ─────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Network Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}, 1000);
