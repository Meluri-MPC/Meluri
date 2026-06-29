/**
 * Share Sync Tests — inventory, gossip, consistency checking, startup sync.
 *
 * Run: npx tsx test/sync/sync.spec.ts
 */

import {
  ShareInventoryStore,
  buildShareAnnounce,
  buildShareRequest,
  buildInventoryRequest,
  buildInventoryResponse,
  buildConsistencyCheck,
} from '../../src/sync/gossip';
import { ConsistencyChecker } from '../../src/sync/consistency';
import { SyncManager } from '../../src/sync';
import type {
  GossipMessage,
  InventoryResponsePayload,
  ConsistencyResult,
} from '../../src/sync/types';

// ─── Test Framework ──────────────────────────────────────────────────────

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

// ─── Suite ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\u2550'.repeat(70));
  console.log('  Share Sync Tests');
  console.log('\u2550'.repeat(70) + '\n');

  // ──────── Share Inventory ──────────────────────────────────────────
  console.log('\u2500'.repeat(70));
  console.log('Share Inventory Store');
  console.log('\u2500'.repeat(70));

  test('Add and check local share', () => {
    const store = new ShareInventoryStore(1);
    store.addShare('wallet-a', 1, '02abcdef');
    assert(store.hasShare('wallet-a', 1), 'Should have own share');
    assert(!store.hasShare('wallet-a', 2), 'Should not have share for party 2');
  });

  test('Record peer share via gossip', () => {
    const store = new ShareInventoryStore(1);
    store.addShare('wallet-a', 1, '02abcdef'); // own share
    store.recordPeerShare('wallet-a', 2, '02abcdef'); // peer share
    store.recordPeerShare('wallet-a', 3, '02abcdef'); // peer share

    assert(store.hasShare('wallet-a', 1), 'Own share missing');
    // Peer shares are recorded but not "held"
    const own = store.getOwnWallets();
    assert(own.length === 1, `Own wallets should be 1, got ${own.length}`);
  });

  test('getOwnWallets returns only this node shares', () => {
    const store = new ShareInventoryStore(2); // This node is party 2
    store.addShare('wallet-a', 2, '02a');
    store.addShare('wallet-b', 2, '02b');
    store.recordPeerShare('wallet-a', 1, '02a');
    store.recordPeerShare('wallet-b', 3, '02b');

    const own = store.getOwnWallets();
    assert(own.length === 2, `Expected 2 own wallets, got ${own.length}`);
    assert(own.every((e) => e.partyIndex === 2), 'All should be party 2');
  });

  test('getAllWalletIds returns unique wallet IDs', () => {
    const store = new ShareInventoryStore(1);
    store.addShare('wallet-a', 1, '02a');
    store.addShare('wallet-b', 1, '02b');
    store.recordPeerShare('wallet-a', 2, '02a');

    const ids = store.getAllWalletIds();
    assert(ids.length === 2, `Expected 2 unique wallet IDs, got ${ids.length}`);
    assert(ids.includes('wallet-a') && ids.includes('wallet-b'), 'Missing wallet IDs');
  });

  test('buildInventory returns correct format', () => {
    const store = new ShareInventoryStore(1);
    store.addShare('wallet-a', 1, '02a');
    store.recordPeerShare('wallet-a', 2, '02a');

    const inv = store.buildInventory(1);
    assert(inv.nodePartyId === 1, 'Wrong node ID');
    assert(inv.wallets.length >= 1, 'Should have at least 1 wallet entry');
  });

  test('countByParty returns histogram', () => {
    const store = new ShareInventoryStore(1);
    store.addShare('w1', 1, 'k1');
    store.addShare('w2', 1, 'k2');
    store.recordPeerShare('w1', 2, 'k1');
    store.recordPeerShare('w2', 3, 'k2');

    const counts = store.countByParty();
    assert(counts.get(1) === 2, `Party 1 should have 2 shares: ${counts.get(1)}`);
  });

  test('computeInventoryHash is deterministic', () => {
    const s1 = new ShareInventoryStore(1);
    s1.addShare('w1', 1, 'k1');
    const h1 = s1.computeInventoryHash();

    const s2 = new ShareInventoryStore(1);
    s2.addShare('w1', 1, 'k1');
    const h2 = s2.computeInventoryHash();

    assert(h1 === h2, 'Same inventory should produce same hash');
  });

  test('computeInventoryHash differs for different wallets', () => {
    const s1 = new ShareInventoryStore(1);
    s1.addShare('w1', 1, 'k1');

    const s2 = new ShareInventoryStore(1);
    s2.addShare('w2', 1, 'k1');

    assert(s1.computeInventoryHash() !== s2.computeInventoryHash(), 'Different wallets should produce different hashes');
  });

  test('getMissingShares identifies wallets with incomplete shares', () => {
    const store = new ShareInventoryStore(1);
    store.addShare('w1', 1, 'k1');
    store.addShare('w2', 1, 'k2');
    store.addShare('w3', 1, 'k3');
    // Only record peer share for w1
    store.recordPeerShare('w1', 2, 'k1');

    const missing = store.getMissingShares(2);
    assert(missing.includes('w2'), 'w2 should be missing for party 2');
    assert(missing.includes('w3'), 'w3 should be missing for party 2');
    assert(!missing.includes('w1'), 'w1 should not be missing');
  });

  // ──────── Gossip Messages ──────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Gossip Message Builders');
  console.log('\u2500'.repeat(70));

  test('buildShareAnnounce has correct structure', () => {
    const msg = buildShareAnnounce(1, 'wallet-x', 1, '02pk');
    assert(msg.type === 'SHARE_ANNOUNCE', `Wrong type: ${msg.type}`);
    assert(msg.from === 1, 'Wrong from');
    assert(msg.to === 0, 'Should be broadcast');
    assert(msg.timestamp > 0, 'Missing timestamp');

    const p = msg.payload as any;
    assert(p.walletId === 'wallet-x', 'Wrong walletId');
    assert(p.partyIndex === 1, 'Wrong partyIndex');
    assert(p.publicKey === '02pk', 'Wrong publicKey');
  });

  test('buildShareRequest has wallet list', () => {
    const msg = buildShareRequest(2, 1, ['w1', 'w2']);
    assert(msg.type === 'SHARE_REQUEST', `Wrong type: ${msg.type}`);
    const p = msg.payload as any;
    assert(p.walletIds.length === 2, `Expected 2 wallet IDs`);
  });

  test('buildInventoryRequest has timestamp', () => {
    const msg = buildInventoryRequest(1, 2);
    assert(msg.type === 'INVENTORY_REQUEST', `Wrong type: ${msg.type}`);
    const p = msg.payload as any;
    assert(typeof p.requestTime === 'number', 'Missing requestTime');
  });

  test('buildConsistencyCheck has inventory hash', () => {
    const msg = buildConsistencyCheck(1, ['w1'], 'abcdef');
    assert(msg.type === 'CONSISTENCY_CHECK', `Wrong type: ${msg.type}`);
    const p = msg.payload as any;
    assert(p.inventoryHash === 'abcdef', 'Wrong hash');
  });

  // ──────── Consistency Checker ─────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Consistency Checker');
  console.log('\u2500'.repeat(70));

  test('Identical inventories are consistent', () => {
    const store = new ShareInventoryStore(1);
    store.addShare('w1', 1, 'k1');
    store.addShare('w2', 1, 'k2');

    const peerResponse: InventoryResponsePayload = {
      nodePartyId: 2,
      wallets: [
        { walletId: 'w1', partyIndex: 2, hasShare: true, publicKey: 'k1', version: 1 },
        { walletId: 'w2', partyIndex: 2, hasShare: true, publicKey: 'k2', version: 1 },
      ],
    };

    const checker = new ConsistencyChecker();
    const result = checker.check(store, peerResponse);
    assert(result.status === 'consistent', `Expected consistent, got ${result.status}`);
    assert(result.localOnly.length === 0, 'No local-only wallets');
    assert(result.peerOnly.length === 0, 'No peer-only wallets');
    assert(result.versionMismatch.length === 0, 'No version mismatches');
  });

  test('Peer missing wallet is detected', () => {
    const store = new ShareInventoryStore(1);
    store.addShare('w1', 1, 'k1');
    store.addShare('only-local', 1, 'k99');

    const peerResponse: InventoryResponsePayload = {
      nodePartyId: 2,
      wallets: [
        { walletId: 'w1', partyIndex: 2, hasShare: true, publicKey: 'k1', version: 1 },
      ],
    };

    const checker = new ConsistencyChecker();
    const result = checker.check(store, peerResponse);
    assert(result.status === 'divergent', `Expected divergent, got ${result.status}`);
    assert(result.localOnly.includes('only-local'), 'Should detect local-only wallet');
  });

  test('Local missing wallet is detected', () => {
    const store = new ShareInventoryStore(1);
    store.addShare('w1', 1, 'k1');

    const peerResponse: InventoryResponsePayload = {
      nodePartyId: 2,
      wallets: [
        { walletId: 'w1', partyIndex: 2, hasShare: true, publicKey: 'k1', version: 1 },
        { walletId: 'peer-only', partyIndex: 2, hasShare: true, publicKey: 'kp', version: 1 },
      ],
    };

    const checker = new ConsistencyChecker();
    const result = checker.check(store, peerResponse);
    assert(result.peerOnly.includes('peer-only'), 'Should detect peer-only wallet');
  });

  test('Version mismatch is detected', () => {
    const store = new ShareInventoryStore(1);
    store.addShare('w1', 1, 'k1', 5); // version 5

    const peerResponse: InventoryResponsePayload = {
      nodePartyId: 2,
      wallets: [
        { walletId: 'w1', partyIndex: 1, hasShare: true, publicKey: 'k1', version: 3 },
      ],
    };

    const checker = new ConsistencyChecker();
    const result = checker.check(store, peerResponse);
    assert(result.versionMismatch.length === 1, `Expected 1 version mismatch, got ${result.versionMismatch.length}`);
    assert(result.versionMismatch[0].localVersion === 5, 'Wrong local version');
    assert(result.versionMismatch[0].peerVersion === 3, 'Wrong peer version');
  });

  test('Quick check with matching hashes returns true', () => {
    const checker = new ConsistencyChecker();
    assert(checker.quickCheck('abc123', 'abc123'), 'Matching hashes should pass');
  });

  test('Quick check with mismatched hashes returns false', () => {
    const checker = new ConsistencyChecker();
    assert(!checker.quickCheck('abc123', 'def456'), 'Mismatched hashes should fail');
  });

  test('Failure counter increments on divergence', () => {
    const checker = new ConsistencyChecker({ maxConsistencyFailures: 3 });
    assert(checker.getFailureCount() === 0, 'Start at 0');

    checker.quickCheck('a', 'b'); // mismatch
    assert(checker.getFailureCount() === 1, 'Should be 1');

    checker.quickCheck('a', 'a'); // match
    assert(checker.getFailureCount() === 0, 'Should reset after match');
  });

  test('isAboveThreshold detects too many failures', () => {
    const checker = new ConsistencyChecker({ maxConsistencyFailures: 2 });
    checker.quickCheck('a', 'b');
    checker.quickCheck('a', 'c');
    assert(checker.isAboveThreshold(), 'Should be above threshold');
  });

  test('resetFailures clears counter', () => {
    const checker = new ConsistencyChecker();
    checker.quickCheck('a', 'b');
    checker.resetFailures();
    assert(checker.getFailureCount() === 0, 'Should be 0 after reset');
  });

  test('needsReshare returns true when divergent', () => {
    const checker = new ConsistencyChecker();
    const result: ConsistencyResult = {
      status: 'divergent',
      localOnly: ['w1'],
      peerOnly: [],
      versionMismatch: [],
    };
    assert(checker.needsReshare(result), 'Divergent should need reshare');
  });

  test('needsReshare returns false when consistent', () => {
    const checker = new ConsistencyChecker();
    const result: ConsistencyResult = {
      status: 'consistent',
      localOnly: [],
      peerOnly: [],
      versionMismatch: [],
    };
    assert(!checker.needsReshare(result), 'Consistent should not need reshare');
  });

  // ──────── Sync Manager ────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Sync Manager');
  console.log('\u2500'.repeat(70));

  test('SyncManager adds local shares and tracks inventory', () => {
    const mgr = new SyncManager(1);
    mgr.addLocalShare('w1', '02key1');
    assert(mgr.getStore().hasShare('w1', 1), 'Should have local share');
  });

  test('SyncManager processes share announce', () => {
    const mgr = new SyncManager(1);
    mgr.onShareAnnounce('w1', 2, '02key1', 1);
    // Peer share recorded, not owned
    const own = mgr.getStore().getOwnWallets();
    assert(own.length === 0, 'Should not own peer share');
  });

  test('SyncManager handleMessage: INVENTORY_REQUEST → responds', async () => {
    const mgr = new SyncManager(2);
    mgr.addLocalShare('w1', '02key1');

    const responses: GossipMessage[] = [];
    await mgr.handleMessage(
      buildInventoryRequest(1, 2),
      (msg) => responses.push(msg),
    );

    assert(responses.length === 1, `Expected 1 response, got ${responses.length}`);
    assert(responses[0].type === 'INVENTORY_RESPONSE', `Wrong response type: ${responses[0].type}`);
  });

  test('SyncManager handleMessage: SHARE_ANNOUNCE updates inventory', async () => {
    const mgr = new SyncManager(1);
    await mgr.handleMessage(
      buildShareAnnounce(2, 'w-new', 2, '02new'),
      () => {},
    );

    // Peer share should be recorded
    const wallets = mgr.getStore().getAllWalletIds();
    assert(wallets.includes('w-new'), 'New wallet should be known');
  });

  test('SyncManager buildDkgAnnouncements for own party only', () => {
    const mgr = new SyncManager(2); // This node is party 2
    const msgs = mgr.buildDkgAnnouncements(
      'wallet-dkg',
      [1, 2, 3],
      '02pk',
      [1, 1, 1],
    );

    // Should only announce party 2's share
    assert(msgs.length === 1, `Expected 1 announcement, got ${msgs.length}`);
    const p = msgs[0].payload as any;
    assert(p.partyIndex === 2, `Should announce party 2 only, got ${p.partyIndex}`);
  });

  test('SyncManager buildStartupRequests for all peers', () => {
    const mgr = new SyncManager(1);
    const requests = mgr.buildStartupRequests([1, 2, 3]);
    assert(requests.length === 2, `Expected 2 requests (peers 2 and 3), got ${requests.length}`);
    assert(requests.every((r) => r.type === 'INVENTORY_REQUEST'), 'All should be inventory requests');
  });

  test('SyncManager start/stop periodic sync', () => {
    const mgr = new SyncManager(1, { consistencyCheckIntervalMs: 100 });
    const sent: GossipMessage[] = [];
    mgr.startPeriodicSync((msg) => sent.push(msg));

    // Wait briefly for one interval
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        mgr.stopPeriodicSync();
        assert(sent.length >= 1, `Expected at least 1 sync message, got ${sent.length}`);
        assert(sent[0].type === 'CONSISTENCY_CHECK', `Wrong type: ${sent[0].type}`);
        resolve();
      }, 200);
    });
  });

  // ─── Summary ─────────────────────────────────────────────────────────
  setTimeout(() => {
    console.log(`\n${'\u2550'.repeat(70)}`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.log(`  \u26a0 ${failed} test(s) failed — review above`);
      process.exit(1);
    } else {
      console.log(`  \u2713 All ${passed} tests passed`);
    }
    console.log('\u2550'.repeat(70));
  }, 1500);
}

runTests();
