/**
 * Discovery Module Tests — Wallet list, metadata, modal helpers.
 *
 * Run: npx tsx test/wallets/discovery.spec.ts
 *
 * Coverage:
 *   - getWalletList (with and without chain filtering)
 *   - getWalletMetadata
 *   - createWalletHtml output structure
 *   - injectModalStyles (idempotent)
 *   - getRememberChoice / setRememberChoice
 */

import {
  getWalletList,
  getWalletMetadata,
  createWalletHtml,
  injectModalStyles,
  getRememberChoice,
  setRememberChoice,
} from '../../src/wallets/discovery/wallet-list';
import type { ChainType, WalletDiscoveryConfig } from '../../src/wallets/types';

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

// Mock localStorage
const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem(key: string) { return storage.get(key) ?? null; },
  setItem(key: string, value: string) { storage.set(key, value); },
  removeItem(key: string) { storage.delete(key); },
  clear() { storage.clear(); },
  get length() { return storage.size; },
  key(index: number) { return Array.from(storage.keys())[index] ?? null; },
};

function setup() { storage.clear(); }

// ─── getWalletList ────────────────────────────────────────────────────

test('getWalletList returns all wallets without filter', () => {
  const wallets = getWalletList();
  assert(wallets.length >= 7, 'Should have at least 7 wallet entries');
  assert(wallets.some(w => w.id === 'leather'), 'Should include leather');
  assert(wallets.some(w => w.id === 'xverse'), 'Should include xverse');
  assert(wallets.some(w => w.id === 'asigna'), 'Should include asigna');
  assert(wallets.some(w => w.id === 'metamask'), 'Should include metamask');
  assert(wallets.some(w => w.id === 'phantom'), 'Should include phantom');
  assert(wallets.some(w => w.id === 'martian'), 'Should include martian');
  assert(wallets.some(w => w.id === 'petra'), 'Should include petra');
});

test('getWalletList filters by stacks chain', () => {
  const wallets = getWalletList({ chain: 'stacks' });
  assert(wallets.length >= 3, 'Should have stacks-compatible wallets');
  for (const w of wallets) {
    assert(w.chains.includes('stacks'), `${w.name} should support stacks`);
  }
});

test('getWalletList filters by ethereum chain', () => {
  const wallets = getWalletList({ chain: 'ethereum' });
  assert(wallets.length >= 2, 'Should have ethereum wallets (MetaMask + Phantom)');
  assert(wallets.some(w => w.id === 'metamask'), 'Should include MetaMask');
  assert(wallets.some(w => w.id === 'phantom'), 'Should include Phantom');
});

test('getWalletList filters by solana chain', () => {
  const wallets = getWalletList({ chain: 'solana' });
  assert(wallets.length >= 1, 'Should have solana wallets');
  assert(wallets.some(w => w.id === 'phantom'), 'Phantom supports solana');
});

test('getWalletList filters by sui chain', () => {
  const wallets = getWalletList({ chain: 'sui' });
  assert(wallets.length >= 1, 'Should have sui wallets');
  assert(wallets.some(w => w.id === 'martian'), 'Martian supports sui');
});

test('getWalletList filters by aptos chain', () => {
  const wallets = getWalletList({ chain: 'aptos' });
  assert(wallets.length >= 2, 'Should have aptos wallets (Martian + Petra)');
  assert(wallets.some(w => w.id === 'martian'), 'Martian supports aptos');
  assert(wallets.some(w => w.id === 'petra'), 'Petra supports aptos');
});

test('getWalletList marks detected correctly', () => {
  const wallets = getWalletList();
  // In Node test environment, no wallets should be detected
  const detected = wallets.filter(w => w.detected);
  assert(detected.length === 0, 'No wallets should be detected in test env');
});

test('getWalletList with bitcoin chain', () => {
  const wallets = getWalletList({ chain: 'bitcoin' });
  assert(wallets.length >= 3, 'Should have bitcoin wallets');
  assert(wallets.every(w => w.chains.includes('bitcoin')), 'All should support bitcoin');
});

// ─── getWalletMetadata ────────────────────────────────────────────────

test('getWalletMetadata returns leather metadata', () => {
  const meta = getWalletMetadata('leather');
  assert(meta !== null, 'Should return metadata for leather');
  assert(meta!.id === 'leather', 'id should match');
  assert(meta!.name === 'Leather', 'name should match');
  assert(meta!.chains.includes('stacks'), 'Should list supported chains');
  assert(meta!.connector !== undefined, 'Should have connector reference');
  assert(typeof meta!.detected === 'boolean', 'detected should be boolean');
});

test('getWalletMetadata returns phantom metadata', () => {
  const meta = getWalletMetadata('phantom');
  assert(meta !== null, 'Should return phantom metadata');
  assert(meta!.chains.includes('solana'), 'Phantom should support solana');
  assert(meta!.chains.includes('ethereum'), 'Phantom should support ethereum');
});

test('getWalletMetadata returns null for unknown wallet', () => {
  const meta = getWalletMetadata('unknown-wallet-v99');
  assert(meta === null, 'Should return null for unknown');
});

// ─── createWalletHtml ────────────────────────────────────────────────

test('createWalletHtml contains modal structure', () => {
  const wallets = getWalletList({ chain: 'stacks' });
  const html = createWalletHtml(wallets);
  assert(html.includes('vx-wallet-modal-overlay'), 'Should contain overlay class');
  assert(html.includes('role="dialog"'), 'Should have dialog role');
  assert(html.includes('aria-modal="true"'), 'Should be aria-modal');
  assert(html.includes('aria-labelledby="vx-wallet-modal-title"'), 'Should have aria-labelledby');
  assert(html.includes('role="listbox"'), 'Should have listbox role');
  assert(html.includes('Connect Wallet'), 'Should have title');
});

test('createWalletHtml contains wallet entries', () => {
  const wallets = getWalletList({ chain: 'stacks' });
  const html = createWalletHtml(wallets);
  assert(html.includes('Leather'), 'Should include Leather name');
  assert(html.includes('Xverse'), 'Should include Xverse name');
  assert(html.includes('Asigna'), 'Should include Asigna name');
});

test('createWalletHtml includes install links for undetected', () => {
  const wallets = getWalletList({ chain: 'stacks' });
  const html = createWalletHtml(wallets, { chain: 'stacks', showInstallLinks: true });
  assert(html.includes('Install'), 'Should include install text');
  assert(html.includes('href='), 'Should have install links');
});

test('createWalletHtml includes remember choice checkbox', () => {
  const wallets = getWalletList();
  const html = createWalletHtml(wallets, { rememberChoice: true });
  assert(html.includes('vx-wallet-remember'), 'Should have remember section');
  assert(html.includes('checkbox'), 'Should have checkbox');
});

test('createWalletHtml hides remember choice when disabled', () => {
  const wallets = getWalletList();
  const html = createWalletHtml(wallets, { rememberChoice: false });
  assert(!html.includes('vx-wallet-remember'), 'Should not have remember section');
});

test('createWalletHtml contains accessible attributes', () => {
  const wallets = getWalletList({ chain: 'stacks' });
  const html = createWalletHtml(wallets);
  assert(html.includes('role="option"'), 'Wallet items should be options');
  assert(html.includes('aria-selected'), 'Wallet items should have aria-selected');
  assert(html.includes('tabindex="0"'), 'Items should be keyboard-focusable');
  assert(html.includes('aria-label="Close'), 'Close button should have label');
});

// ─── injectModalStyles ────────────────────────────────────────────────

test('injectModalStyles is callable without error', () => {
  // Create a mock document.head
  const mockStyleElement = { id: '' };
  const mockHead = {
    children: [] as any[],
    appendChild(el: any) { mockHead.children.push(el); },
  };

  (globalThis as any).document = {
    getElementById(id: string) {
      return mockHead.children.find((c: any) => c.id === id) || null;
    },
    head: mockHead,
    createElement(tag: string) {
      return { tagName: tag, id: '', textContent: '', appendChild: () => {} };
    },
  };

  // First call should inject
  mockHead.children = [];
  injectModalStyles();
  assert(mockHead.children.length === 1, 'Should append one style element');
  assert(mockHead.children[0].id === 'vx-wallet-modal-styles', 'Should have correct id');

  // Second call should be idempotent
  injectModalStyles();
  assert(mockHead.children.length === 1, 'Should not double-inject');

  delete (globalThis as any).document;
});

// ─── Remember Choice ──────────────────────────────────────────────────

test('getRememberChoice returns false by default', () => {
  setup();
  assert(getRememberChoice() === false, 'Should default to false');
});

test('setRememberChoice and getRememberChoice round-trip', () => {
  setup();
  setRememberChoice(true);
  assert(getRememberChoice() === true, 'Should return true after setting true');

  setRememberChoice(false);
  assert(getRememberChoice() === false, 'Should return false after setting false');
});

test('getRememberChoice handles missing localStorage gracefully', () => {
  const oldStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = undefined;
  try {
    assert(getRememberChoice() === false, 'Should default to false when no storage');
  } finally {
    (globalThis as any).localStorage = oldStorage;
  }
});

test('setRememberChoice handles missing localStorage gracefully', () => {
  const oldStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = undefined;
  try {
    setRememberChoice(true);
    assert(true, 'Should not throw');
  } finally {
    (globalThis as any).localStorage = oldStorage;
  }
});

// ─── Wallet List Item Structure ───────────────────────────────────────

test('WalletListItem has all required fields', () => {
  const wallets = getWalletList();
  for (const wallet of wallets) {
    assert(typeof wallet.id === 'string' && wallet.id.length > 0, `${wallet.id} has id`);
    assert(typeof wallet.name === 'string' && wallet.name.length > 0, `${wallet.id} has name`);
    assert(typeof wallet.icon === 'string', `${wallet.id} has icon`);
    assert(typeof wallet.installUrl === 'string' && wallet.installUrl.startsWith('http'), `${wallet.id} has valid install URL`);
    assert(Array.isArray(wallet.chains) && wallet.chains.length > 0, `${wallet.id} has chains`);
    assert(typeof wallet.detected === 'boolean', `${wallet.id} has detected boolean`);
  }
});

// ─── Summary ─────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Discovery Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}, 1000);
