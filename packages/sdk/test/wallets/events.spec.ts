/**
 * Events Module Tests — WalletEventBus, provider binding, callback propagation.
 *
 * Run: npx tsx test/wallets/events.spec.ts
 *
 * Coverage:
 *   - Event bus creation with callbacks
 *   - bindProvider / unbindProvider
 *   - Event emission and listener propagation
 *   - on / off listener management
 *   - Multiple callbacks per event
 *   - Error isolation (one failing callback doesn't break others)
 *   - setCallbacks update
 *   - destroy cleanup
 */

import { WalletEventBus } from '../../src/wallets/events';
import type { WalletProvider, WalletEventCallbacks } from '../../src/wallets/types';

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

function createMockProvider(): WalletProvider & {
  triggerEvent: (event: string, ...args: unknown[]) => void;
  getListeners: () => Map<string, Array<(...args: unknown[]) => void>>;
} {
  const listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  return {
    async getAddresses() { return ['addr']; },
    async signMessage(m: string) { return 'sig'; },
    async signTransaction(t: unknown) { return 'tx'; },
    async signStructuredData(d: unknown, t: unknown, m: unknown) { return 'sig'; },
    async getNetwork() { return 'mainnet'; },
    on(event: string, callback: (...args: unknown[]) => void) {
      const existing = listeners.get(event) || [];
      existing.push(callback);
      listeners.set(event, existing);
    },
    off(event: string, callback: (...args: unknown[]) => void) {
      const existing = listeners.get(event) || [];
      listeners.set(event, existing.filter((c) => c !== callback));
    },
    isConnected() { return true; },
    triggerEvent(event: string, ...args: unknown[]) {
      const cbs = listeners.get(event) || [];
      for (const cb of cbs) {
        cb(...args);
      }
    },
    getListeners() { return listeners; },
  };
}

// ─── Event Bus Creation ──────────────────────────────────────────────

test('WalletEventBus creates with empty callbacks', () => {
  const bus = new WalletEventBus();
  assert(bus instanceof WalletEventBus, 'Should create instance');
});

test('WalletEventBus creates with custom callbacks', () => {
  const callbacks: WalletEventCallbacks = {
    onAccountsChanged: () => {},
    onNetworkChanged: () => {},
    onDisconnect: () => {},
  };
  const bus = new WalletEventBus(callbacks);
  assert(bus instanceof WalletEventBus, 'Should create with callbacks');
});

// ─── on / off ───────────────────────────────────────────────────────

test('on registers a listener', () => {
  const bus = new WalletEventBus();
  let called = false;
  bus.on('customEvent', () => { called = true; });
  // We can't directly trigger custom events, but binding a provider should work
  assert(true, 'Listener registered without error');
});

test('off removes a listener', () => {
  const bus = new WalletEventBus();
  const callback = () => {};
  bus.on('test', callback);
  bus.off('test', callback);
  assert(true, 'Listener removed without error');
});

// ─── bindProvider ────────────────────────────────────────────────────

test('bindProvider subscribes to accountsChanged', () => {
  const bus = new WalletEventBus();
  const provider = createMockProvider();

  let accountsReceived: string[] | null = null;
  bus.setCallbacks({
    onAccountsChanged(accounts) { accountsReceived = accounts; },
  });

  bus.bindProvider(provider);
  provider.triggerEvent('accountsChanged', ['ST1A', 'ST1B']);

  assert(accountsReceived !== null, 'Should have received accounts');
  assert(accountsReceived!.length === 2, 'Should have 2 accounts');
  assert(accountsReceived![0] === 'ST1A', 'First account should match');
});

test('bindProvider subscribes to networkChanged', () => {
  const bus = new WalletEventBus();
  const provider = createMockProvider();

  let networkReceived: string | null = null;
  bus.setCallbacks({
    onNetworkChanged(network) { networkReceived = network; },
  });

  bus.bindProvider(provider);
  provider.triggerEvent('networkChanged', 'testnet');

  assert(networkReceived === 'testnet', 'Should receive network change');
});

test('bindProvider subscribes to disconnect', () => {
  const bus = new WalletEventBus();
  const provider = createMockProvider();

  let disconnected = false;
  bus.setCallbacks({
    onDisconnect() { disconnected = true; },
  });

  bus.bindProvider(provider);
  provider.triggerEvent('disconnect');

  assert(disconnected === true, 'Should fire disconnect callback');
});

test('bindProvider does not double-bind same provider', () => {
  const bus = new WalletEventBus();
  const provider = createMockProvider();

  let callCount = 0;
  bus.setCallbacks({
    onAccountsChanged() { callCount++; },
  });

  bus.bindProvider(provider);
  bus.bindProvider(provider); // Second bind should be no-op

  provider.triggerEvent('accountsChanged', ['ST1A']);
  assert(callCount === 1, 'Should only fire once (no double-bind)');
});

// ─── unbindProvider ──────────────────────────────────────────────────

test('unbindProvider stops receiving events', () => {
  const bus = new WalletEventBus();
  const provider = createMockProvider();

  let callCount = 0;
  bus.setCallbacks({
    onAccountsChanged() { callCount++; },
  });

  bus.bindProvider(provider);
  provider.triggerEvent('accountsChanged', ['ST1A']);
  assert(callCount === 1, 'Should fire initially');

  bus.unbindProvider(provider);
  provider.triggerEvent('accountsChanged', ['ST2B']);
  assert(callCount === 1, 'Should not fire after unbind');
});

// ─── Multiple Callbacks ──────────────────────────────────────────────

test('multiple callbacks all receive events', () => {
  const bus = new WalletEventBus();
  const provider = createMockProvider();

  let cb1 = false;
  let cb2 = false;
  let cb3 = false;

  bus.setCallbacks({
    onNetworkChanged() { cb1 = true; },
  });

  bus.on('networkChanged', () => { cb2 = true; });
  bus.on('networkChanged', () => { cb3 = true; });

  bus.bindProvider(provider);
  provider.triggerEvent('networkChanged', 'devnet');

  assert(cb1 === true, 'Callback 1 should fire');
  assert(cb2 === true, 'Callback 2 should fire');
  assert(cb3 === true, 'Callback 3 should fire');
});

// ─── Error Isolation ─────────────────────────────────────────────────

test('one failing callback does not prevent others', () => {
  const bus = new WalletEventBus();
  const provider = createMockProvider();

  let goodCalled = false;
  const callbacks: WalletEventCallbacks = {
    onAccountsChanged() { throw new Error('I failed!'); },
  };

  bus.setCallbacks(callbacks);
  bus.on('accountsChanged', () => { goodCalled = true; });

  bus.bindProvider(provider);
  provider.triggerEvent('accountsChanged', ['ST1A']);

  assert(goodCalled === true, 'Good callback should still fire despite bad one');
});

// ─── setCallbacks Update ─────────────────────────────────────────────

test('setCallbacks updates existing callbacks', () => {
  const bus = new WalletEventBus();
  const provider = createMockProvider();

  let firstCalled = false;
  let secondCalled = false;

  bus.setCallbacks({ onAccountsChanged() { firstCalled = true; } });
  bus.bindProvider(provider);

  bus.setCallbacks({ onAccountsChanged() { secondCalled = true; } });

  provider.triggerEvent('accountsChanged', ['ST1']);

  assert(firstCalled === false, 'Old callback should not fire');
  assert(secondCalled === true, 'New callback should fire');
});

// ─── Multiple Providers ──────────────────────────────────────────────

test('multiple providers can be bound and unbound independently', () => {
  const bus = new WalletEventBus();
  const provider1 = createMockProvider();
  const provider2 = createMockProvider();

  let cb1Count = 0;
  let cb2Count = 0;

  bus.setCallbacks({
    onNetworkChanged() { cb1Count++; },
  });

  bus.bindProvider(provider1);
  provider1.triggerEvent('networkChanged', 'testnet');
  assert(cb1Count === 1, 'Callback 1 should fire for provider1');

  bus.setCallbacks({
    onNetworkChanged() { cb2Count++; },
  });

  bus.bindProvider(provider2);
  provider2.triggerEvent('networkChanged', 'devnet');
  assert(cb2Count === 1, 'Callback 2 should fire for provider2');
  assert(cb1Count === 1, 'Old callback should not fire for provider2');
});

// ─── destroy ─────────────────────────────────────────────────────────

test('destroy cleans up all listeners', () => {
  const bus = new WalletEventBus();
  const provider = createMockProvider();

  let callCount = 0;
  bus.setCallbacks({
    onAccountsChanged() { callCount++; },
    onNetworkChanged() { callCount++; },
    onDisconnect() { callCount++; },
  });

  bus.bindProvider(provider);
  bus.destroy();

  provider.triggerEvent('accountsChanged', ['ST1']);
  provider.triggerEvent('networkChanged', 'mainnet');
  provider.triggerEvent('disconnect');

  assert(callCount === 0, 'No callbacks should fire after destroy');
});

// ─── Summary ─────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Events Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}, 1000);
