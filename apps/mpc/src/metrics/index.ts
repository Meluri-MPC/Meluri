import {
  Counter,
  Histogram,
  Gauge,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'mpc_' });

// ─── Counters ──────────────────────────────────────────────────

export const dkgTotal = new Counter({
  name: 'mpc_dkg_total',
  help: 'Total number of DKG ceremonies initiated',
  registers: [registry],
});

export const dkgErrorsTotal = new Counter({
  name: 'mpc_dkg_errors_total',
  help: 'Total number of DKG ceremony errors',
  registers: [registry],
});

export const signingTotal = new Counter({
  name: 'mpc_signing_total',
  help: 'Total number of signing requests',
  labelNames: ['chain'],
  registers: [registry],
});

export const signingErrorsTotal = new Counter({
  name: 'mpc_signing_errors_total',
  help: 'Total number of signing request errors',
  labelNames: ['chain', 'error'],
  registers: [registry],
});

export const peerDisconnectsTotal = new Counter({
  name: 'mpc_peer_disconnects_total',
  help: 'Total number of peer disconnects detected',
  registers: [registry],
});

// ─── Histograms ────────────────────────────────────────────────

export const dkgDurationSeconds = new Histogram({
  name: 'mpc_dkg_duration_seconds',
  help: 'DKG ceremony duration in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export const signingDurationSeconds = new Histogram({
  name: 'mpc_signing_duration_seconds',
  help: 'Signing ceremony duration in seconds',
  labelNames: ['chain'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

export const wsMessageLatencySeconds = new Histogram({
  name: 'mpc_websocket_message_latency_seconds',
  help: 'WebSocket message round-trip latency in seconds',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
  registers: [registry],
});

// ─── Gauges ────────────────────────────────────────────────────

export const activeCeremonies = new Gauge({
  name: 'mpc_active_ceremonies',
  help: 'Number of currently active signing ceremonies',
  registers: [registry],
});

export const peerConnections = new Gauge({
  name: 'mpc_peer_connections',
  help: 'Number of connected peers',
  registers: [registry],
});

export const walletSharesCount = new Gauge({
  name: 'mpc_wallet_shares_count',
  help: 'Number of wallet shares stored in memory',
  registers: [registry],
});
