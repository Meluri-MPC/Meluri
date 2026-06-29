/**
 * Node Topology Tests — identity, discovery, party selection, cluster management.
 *
 * Run: npx tsx test/topology/topology.spec.ts
 */

import { randomBytes } from 'crypto';
import {
  generateNodeIdentity,
  createNodeIdentity,
  signChallenge,
  verifyChallenge,
  generateAuthChallenge,
  authenticatePeer,
} from '../../src/topology/identity';
import {
  StaticDiscovery,
  DynamicDiscovery,
  createDiscovery,
} from '../../src/topology/discovery';
import { PartySelector } from '../../src/topology/selector';
import { ClusterManager } from '../../src/topology';
import type { NodeHealth, SelectionCriteria } from '../../src/topology/types';

// ─── Test Framework ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: (done?: () => void) => void | Promise<void>, timeoutMs = 5000) {
  (async () => {
    try {
      if (fn.length > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Test timed out after ${timeoutMs}ms`)), timeoutMs);
          try { fn(() => { clearTimeout(timer); resolve(); }); } catch (e) { clearTimeout(timer); reject(e); }
        });
      } else {
        await fn();
      }
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

// ─── Suite ──────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\u2550'.repeat(70));
  console.log('  Node Topology Tests');
  console.log('\u2550'.repeat(70) + '\n');

  // ──────── Node Identity ────────────────────────────────────────────
  console.log('\u2500'.repeat(70));
  console.log('Node Identity');
  console.log('\u2500'.repeat(70));

  test('Ed25519 identity generation', () => {
    const id = generateNodeIdentity();
    assert(id.publicKey.length === 64, `Pubkey hex should be 64 chars, got ${id.publicKey.length}`);
    assert(id.privateKey.length === 64, `Privkey hex should be 64 chars, got ${id.privateKey.length}`);
    assert(id.publicKeyBytes.length === 32, `Pubkey bytes should be 32`);
  });

  test('Two identities are unique', () => {
    const id1 = generateNodeIdentity();
    const id2 = generateNodeIdentity();
    assert(id1.publicKey !== id2.publicKey, 'Same public key');
    assert(id1.privateKey !== id2.privateKey, 'Same private key');
  });

  test('Challenge authentication: sign + verify', () => {
    const id = generateNodeIdentity();
    const challenge = generateAuthChallenge();

    const signature = signChallenge(challenge, id.privateKey);
    const valid = verifyChallenge(challenge, signature, id.publicKey);
    assert(valid, 'Valid challenge signature should verify');
  });

  test('Challenge auth rejects wrong public key', () => {
    const id1 = generateNodeIdentity();
    const id2 = generateNodeIdentity();
    const challenge = generateAuthChallenge();

    const signature = signChallenge(challenge, id1.privateKey);
    const valid = verifyChallenge(challenge, signature, id2.publicKey);
    assert(!valid, 'Wrong public key should reject signature');
  });

  test('Challenge auth rejects tampered challenge', () => {
    const id = generateNodeIdentity();
    const challenge = generateAuthChallenge();
    const signature = signChallenge(challenge, id.privateKey);

    const tampered = new Uint8Array(challenge);
    tampered[0] = (tampered[0] + 1) % 256;
    const valid = verifyChallenge(tampered, signature, id.publicKey);
    assert(!valid, 'Tampered challenge should reject');
  });

  test('Challenge auth rejects tampered signature', () => {
    const id = generateNodeIdentity();
    const challenge = generateAuthChallenge();
    const signature = signChallenge(challenge, id.privateKey);

    const tampered = new Uint8Array(signature);
    tampered[0] = (tampered[0] + 1) % 256;
    const valid = verifyChallenge(challenge, tampered, id.publicKey);
    assert(!valid, 'Tampered signature should reject');
  });

  test('Challenge is non-deterministic', () => {
    const c1 = generateAuthChallenge();
    const c2 = generateAuthChallenge();
    assert(
      Buffer.compare(Buffer.from(c1), Buffer.from(c2)) !== 0,
      'Two challenges should differ',
    );
  });

  test('authenticatePeer produces valid signature', () => {
    const id = generateNodeIdentity();
    const challenge = generateAuthChallenge();
    const sig = authenticatePeer(id, challenge);
    const valid = verifyChallenge(challenge, sig, id.publicKey);
    assert(valid, 'authenticatePeer should produce valid signature');
  });

  test('createNodeIdentity builds valid NodeIdentity', () => {
    const id = generateNodeIdentity();
    const node = createNodeIdentity(1, '10.0.0.1', 8080, 'us-east-1', id);
    assert(node.partyId === 1, 'Wrong partyId');
    assert(node.name === 'mpc-node-0', `Wrong name: ${node.name}`);
    assert(node.host === '10.0.0.1', 'Wrong host');
    assert(node.port === 8080, 'Wrong port');
    assert(node.uri === 'ws://10.0.0.1:8080', `Wrong URI: ${node.uri}`);
    assert(node.region === 'us-east-1', 'Wrong region');
    assert(node.ed25519PublicKey === id.publicKey, 'Wrong pubkey');
  });

  // ──────── Discovery ────────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Node Discovery');
  console.log('\u2500'.repeat(70));

  test('StaticDiscovery resolves peers by party ID', () => {
    const peers = ['ws://peer1:8081', 'ws://peer2:8082', 'ws://peer3:8083'];
    const disc = new StaticDiscovery(peers);

    assert(disc.resolve(1) === 'ws://peer1:8081', 'Party 1 wrong');
    assert(disc.resolve(2) === 'ws://peer2:8082', 'Party 2 wrong');
    assert(disc.resolve(3) === 'ws://peer3:8083', 'Party 3 wrong');
    assert(disc.resolve(4) === null, 'Non-existent party should be null');
  });

  test('StaticDiscovery.discover returns all peers', () => {
    const disc = new StaticDiscovery(['ws://a:1', 'ws://b:2']);
    const all = disc.discover();
    assert(all.size === 2, `Expected 2 peers, got ${all.size}`);
    assert(all.get(1) === 'ws://a:1', 'Peer 1 wrong');
    assert(all.get(2) === 'ws://b:2', 'Peer 2 wrong');
  });

  test('StaticDiscovery setPeer/removePeer', () => {
    const disc = new StaticDiscovery(['ws://a:1']);
    disc.setPeer(2, 'ws://b:2');
    assert(disc.resolve(2) === 'ws://b:2', 'Add failed');
    disc.removePeer(2);
    assert(disc.resolve(2) === null, 'Remove failed');
  });

  test('DynamicDiscovery start/stop', () => {
    const disc = new DynamicDiscovery({ endpoint: 'http://test:8500', refreshIntervalMs: 1000 });
    assert(!disc.isActive(), 'Should be inactive before start');
    disc.start();
    assert(disc.isActive(), 'Should be active after start');
    disc.stop();
    assert(!disc.isActive(), 'Should be inactive after stop');
  });

  test('DynamicDiscovery update from programmatic source', () => {
    const disc = new DynamicDiscovery({ endpoint: 'http://test:8500' });
    const peers = new Map<number, string>();
    peers.set(1, 'ws://p1:1');
    peers.set(2, 'ws://p2:2');
    disc.update(peers);
    const all = disc.discover();
    assert(all.size === 2, `Expected 2 peers, got ${all.size}`);
  });

  test('createDiscovery factory: static', () => {
    const disc = createDiscovery({
      source: 'static',
      staticPeers: ['ws://a:1', 'ws://b:2'],
    });
    assert(disc instanceof StaticDiscovery, 'Should be StaticDiscovery');
    assert(disc.discover().size === 2, 'Should have 2 peers');
  });

  test('createDiscovery factory: dynamic', () => {
    const disc = createDiscovery({
      source: 'dynamic',
      endpoint: 'http://test:8500',
      refreshIntervalMs: 5000,
    });
    assert(disc instanceof DynamicDiscovery, 'Should be DynamicDiscovery');
  });

  // ──────── Party Selector ────────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Party Selector');
  console.log('\u2500'.repeat(70));

  function makeHealthyNode(id: number, latency = 10, ceremonies = 0): NodeHealth {
    return {
      partyId: id,
      status: 'online',
      lastHeartbeat: Date.now(),
      latencyMs: latency,
      activeCeremonies: ceremonies,
      maxCeremonies: 10,
      eligible: true,
    };
  }

  test('All 3 nodes online: selects 2 with lowest latency', () => {
    const selector = new PartySelector();
    selector.updateHealth(makeHealthyNode(1, 5));
    selector.updateHealth(makeHealthyNode(2, 50));
    selector.updateHealth(makeHealthyNode(3, 10));

    const result = selector.select(2);
    assert(result.selected.length === 2, `Expected 2 selected, got ${result.selected.length}`);
    // Node 1 (5ms) should be selected first
    assert(result.selected.includes(1), 'Lowest latency node should be selected');
    assert(result.fallback !== null, 'Should have fallback');
  });

  test('Only 2 eligible nodes: selects both, no fallback', () => {
    const selector = new PartySelector();
    selector.updateHealth(makeHealthyNode(1, 10));
    selector.updateHealth({ ...makeHealthyNode(2, 20), eligible: false });
    selector.updateHealth(makeHealthyNode(3, 30));

    const result = selector.select(2);
    assert(result.selected.length === 2, `Expected 2 selected, got ${result.selected.length}`);
    assert(!result.selected.includes(2), 'Node 2 should be excluded');
    assert(result.fallback === null, 'No fallback when only 2 eligible');
  });

  test('Only 1 eligible node: returns empty', () => {
    const selector = new PartySelector();
    selector.updateHealth(makeHealthyNode(1, 10));
    selector.updateHealth({ ...makeHealthyNode(2, 20), status: 'offline' });
    selector.updateHealth({ ...makeHealthyNode(3, 30), status: 'degraded' });

    const result = selector.select(2);
    assert(result.selected.length === 0, 'Should have no selection');
    assert(result.reason.includes('Only 1'), `Reason: ${result.reason}`);
  });

  test('Excluded parties are skipped', () => {
    const selector = new PartySelector();
    selector.updateHealth(makeHealthyNode(1, 10));
    selector.updateHealth(makeHealthyNode(2, 20));
    selector.updateHealth(makeHealthyNode(3, 30));

    const result = selector.select(2, { excludeParties: [1] });
    assert(!result.selected.includes(1), 'Node 1 should be excluded');
    assert(result.selected.includes(2) && result.selected.includes(3), 'Should select 2 and 3');
  });

  test('Prefer low load over latency (when configured)', () => {
    const selector = new PartySelector();
    // Node 1: low latency but high load
    selector.updateHealth({ ...makeHealthyNode(1, 5), activeCeremonies: 9 });
    // Node 2: higher latency but low load
    selector.updateHealth(makeHealthyNode(2, 100, 0));
    selector.updateHealth(makeHealthyNode(3, 50, 5));

    const result = selector.select(2, { preferLowLoad: true, preferLowLatency: false });
    assert(result.selected.includes(2), 'Low load node should be preferred');
  });

  test('selectWithCoordinator: coordinator always included', () => {
    const selector = new PartySelector();
    selector.updateHealth(makeHealthyNode(1, 100)); // coordinator, high latency
    selector.updateHealth(makeHealthyNode(2, 5));   // better
    selector.updateHealth(makeHealthyNode(3, 10));

    const result = selector.selectWithCoordinator(1);
    assert(result.selected.length === 2, `Expected 2 selected, got ${result.selected.length}`);
    assert(result.selected.includes(1), 'Coordinator must be included');
  });

  test('selectWithCoordinator: rejects if coordinator offline', () => {
    const selector = new PartySelector();
    selector.updateHealth({ ...makeHealthyNode(1), status: 'offline' });
    selector.updateHealth(makeHealthyNode(2));
    selector.updateHealth(makeHealthyNode(3));

    const result = selector.selectWithCoordinator(1);
    assert(result.selected.length === 0, 'Should reject offline coordinator');
  });

  test('getAllHealth returns all nodes', () => {
    const selector = new PartySelector();
    selector.updateHealth(makeHealthyNode(1));
    selector.updateHealth(makeHealthyNode(2));
    selector.updateHealth(makeHealthyNode(3));
    assert(selector.getAllHealth().length === 3, 'Should have 3 health entries');
  });

  test('removeNode then select', () => {
    const selector = new PartySelector();
    selector.updateHealth(makeHealthyNode(1));
    selector.updateHealth(makeHealthyNode(2));
    selector.updateHealth(makeHealthyNode(3));
    selector.removeNode(3);

    const result = selector.select(2);
    assert(result.selected.length === 2, 'Should work with 2 nodes');
    assert(result.fallback === null, 'No fallback');
  });

  // ──────── Cluster Manager ───────────────────────────────────────────
  console.log('\n' + '\u2500'.repeat(70));
  console.log('Cluster Manager');
  console.log('\u2500'.repeat(70));

  test('ClusterManager.createDefault creates 3-node cluster', () => {
    const cluster = ClusterManager.createDefault(1);
    assert(cluster.getAllNodes().length === 3, 'Should have 3 nodes');
    assert(cluster.getOwnPartyId() === 1, 'Own ID should be 1');
    assert(cluster.getOtherNodes().length === 2, 'Should have 2 other nodes');
  });

  test('ClusterManager nodes have correct names', () => {
    const cluster = ClusterManager.createDefault(1);
    assert(cluster.getNode(1)!.name === 'mpc-node-0', 'Node 1 name');
    assert(cluster.getNode(2)!.name === 'mpc-node-1', 'Node 2 name');
    assert(cluster.getNode(3)!.name === 'mpc-node-2', 'Node 3 name');
  });

  test('ClusterManager nodes are in different regions', () => {
    const cluster = ClusterManager.createDefault(1);
    const regions = new Set(cluster.getAllNodes().map((n) => n.region));
    assert(regions.size === 3, 'All 3 nodes should be in different regions');
  });

  test('ClusterManager identities are unique', () => {
    const cluster = ClusterManager.createDefault(1);
    const pk1 = cluster.getIdentity(1)!.publicKey;
    const pk2 = cluster.getIdentity(2)!.publicKey;
    const pk3 = cluster.getIdentity(3)!.publicKey;
    assert(pk1 !== pk2 && pk2 !== pk3 && pk1 !== pk3, 'All pubkeys should be unique');
  });

  test('ClusterManager initializeHealth → markAllOnline → select', () => {
    const cluster = ClusterManager.createDefault(1);
    cluster.initializeHealth();
    cluster.markAllOnline();

    const result = cluster.selectParties();
    assert(result.selected.length === 2, `Expected 2 selected, got ${result.selected.length}`);
    assert(result.fallback !== null, 'Should have fallback');
    assert(result.reason.includes('party-'), `Reason: ${result.reason}`);
  });

  test('ClusterManager selectPartiesAsCoordinator', () => {
    const cluster = ClusterManager.createDefault(2);
    cluster.initializeHealth();
    cluster.markAllOnline();

    const result = cluster.selectPartiesAsCoordinator();
    assert(result.selected.length === 2, `Expected 2 selected`);
    assert(result.selected.includes(2), `Coordinator (2) must be included: got ${result.selected}`);
  });

  test('ClusterManager selectWithExclusions', () => {
    const cluster = ClusterManager.createDefault(1);
    cluster.initializeHealth();
    cluster.markAllOnline();

    const result = cluster.selectWithExclusions([2]);
    assert(!result.selected.includes(2), 'Party 2 should be excluded');
    assert(result.selected.includes(1), 'Party 1 should be selected');
    assert(result.selected.includes(3), 'Party 3 should be selected');
  });

  test('ClusterManager getPeerUri resolves discovery', () => {
    const cluster = ClusterManager.createDefault(1);
    const uri = cluster.getPeerUri(2);
    assert(uri !== null, 'Should resolve peer 2');
    assert(uri!.startsWith('ws://'), `URI should start with ws://: ${uri}`);
  });

  test('ClusterManager getOwnNode returns correct node', () => {
    const cluster = ClusterManager.createDefault(3);
    const own = cluster.getOwnNode();
    assert(own.partyId === 3, `Expected party 3, got ${own.partyId}`);
    assert(own.name === 'mpc-node-2', `Expected mpc-node-2, got ${own.name}`);
  });

  test('ClusterManager node URIs are unique', () => {
    const cluster = ClusterManager.createDefault(1);
    const uris = new Set(cluster.getAllNodes().map((n) => n.uri));
    assert(uris.size === 3, 'All URIs should be unique');
  });

  test('ClusterManager maintains separate identities across instances', () => {
    const c1 = ClusterManager.createDefault(1);
    const c2 = ClusterManager.createDefault(2);

    // Different instances should have different keys
    assert(
      c1.getIdentity(1)!.publicKey !== c2.getIdentity(1)!.publicKey,
      'Keys should differ across instances',
    );
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
  }, 1000);
}

runTests();
