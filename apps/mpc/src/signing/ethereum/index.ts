/**
 * Ethereum Signing — address derivation and signing on secp256k1.
 *
 * Uses the existing TSS SigningCeremony for signature generation,
 * then wraps in Ethereum-specific formats (r/s/v with EIP-155 chain ID).
 *
 * Address derivation: keccak256(uncompressed_pubkey[1:]) → last 20 bytes
 * Signature format: r (uint256), s (uint256), v (uint8 with chain ID encoding)
 *
 * Supported operations:
 *   - Address derivation from uncompressed public key
 *   - EIP-191 personal_sign (sign arbitrary message)
 *   - EIP-1559 transaction signing (type 2)
 *   - Legacy transaction signing (type 0)
 */

import { sha3_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha256';
import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';

secp.etc.hmacSha256Sync = (k: Uint8Array, ...msgs: Uint8Array[]) => {
  let h: Uint8Array = new Uint8Array(0);
  for (const msg of msgs) {
    h = hmac(sha256, k, msg);
    k = h;
  }
  return h;
};

import { SigningCeremony, type PartyId } from '../index';

// ─── Types ──────────────────────────────────────────────────────────────

export type EthereumNetwork = 'mainnet' | 'goerli' | 'sepolia' | 'holesky';

export interface EthereumAddress {
  address: string;
  checksumAddress: string;
  publicKey: string;
}

export interface EthereumSignature {
  /** r component (hex, no 0x prefix, 64 chars) */
  r: string;
  /** s component (hex, no 0x prefix, 64 chars) */
  s: string;
  /** v — recovery ID + chain ID encoding per EIP-155 */
  v: number;
  /** ABI-encoded signature: 0x + r(32) + s(32) + v(32) (65 bytes total) */
  hex: string;
}

/** EIP-1559 dynamic fee transaction */
export interface EIP1559Tx {
  chainId: number;
  nonce: number;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
  to: string;
  value: bigint;
  data: string;
  accessList?: Array<{ address: string; storageKeys: string[] }>;
}

/** Legacy (type 0) transaction */
export interface LegacyTx {
  chainId?: number;
  nonce: number;
  gasPrice: bigint;
  gasLimit: bigint;
  to: string;
  value: bigint;
  data: string;
}

// ─── Address Derivation ─────────────────────────────────────────────────

/**
 * Derive an Ethereum address from an uncompressed public key.
 *
 * address = last 20 bytes of keccak256(uncompressed_pubkey[1:])
 * checksum = EIP-55 mixed-case hex
 */
export function deriveEthereumAddress(
  publicKeyCompressed: Uint8Array,
): EthereumAddress {
  // Convert compressed to uncompressed point for hashing
  const point = secp.Point.fromHex(Buffer.from(publicKeyCompressed).toString('hex'));
  const uncompressed = Buffer.from(point.toRawBytes(false)); // 04 || x || y (65 bytes)

  // keccak256 of the uncompressed key (excluding the 0x04 prefix byte)
  const hash = sha3_256(uncompressed.subarray(1));
  const addressBytes = hash.subarray(12); // last 20 bytes

  const address = '0x' + Buffer.from(addressBytes).toString('hex');
  const checksumAddress = toChecksumAddress(address);

  return {
    address: address.toLowerCase(),
    checksumAddress,
    publicKey: Buffer.from(publicKeyCompressed).toString('hex'),
  };
}

/**
 * EIP-55 checksum address generation.
 */
export function toChecksumAddress(address: string): string {
  const addr = address.toLowerCase().replace('0x', '');
  const hash = Buffer.from(sha3_256(Buffer.from(addr))).toString('hex');

  let result = '0x';
  for (let i = 0; i < addr.length; i++) {
    result += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  }
  return result;
}

// ─── Message Signing (EIP-191) ──────────────────────────────────────────

/**
 * EIP-191 personal_sign message hash.
 *
 * personal_sign hash = keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)
 */
export function personalSignHash(message: string): Uint8Array {
  const prefix = Buffer.from('\x19Ethereum Signed Message:\n', 'utf8');
  const msgBytes = Buffer.from(message, 'utf8');
  const lenBytes = Buffer.from(msgBytes.length.toString(), 'utf8');
  const combined = Buffer.concat([prefix, lenBytes, msgBytes]);
  return sha3_256(combined);
}

/**
 * Sign an Ethereum message using EIP-191 personal_sign.
 *
 * @returns EthereumSignature with r/s/v
 */
export function signEthereumMessage(
  message: string,
  partyA: PartyId,
  shareA: bigint,
  partyB: PartyId,
  shareB: bigint,
  publicKey: string,
  chainId?: number,
): EthereumSignature {
  const msghash = personalSignHash(message);
  return signEthereumHash(msghash, partyA, shareA, partyB, shareB, publicKey, chainId);
}

/**
 * Sign a keccak256 hash with Ethereum signature format.
 */
export function signEthereumHash(
  hash: Uint8Array,
  partyA: PartyId,
  shareA: bigint,
  partyB: PartyId,
  shareB: bigint,
  publicKey: string,
  chainId?: number,
): EthereumSignature {
  const result = SigningCeremony.sign(
    `eth-sig-${Date.now()}`,
    partyA,
    shareA,
    partyB,
    shareB,
    hash,
    publicKey,
  );

  // v = recoveryId + 27 (legacy) or recoveryId + 35 + 2*chainId (EIP-155)
  let v: number;
  if (chainId !== undefined && chainId > 0) {
    v = result.recoveryId + 35 + chainId * 2;
  } else {
    v = result.recoveryId + 27;
  }

  const rHex = result.r.toString(16).padStart(64, '0');
  const sHex = result.s.toString(16).padStart(64, '0');
  const vHex = v.toString(16).padStart(64, '0');

  return {
    r: rHex,
    s: sHex,
    v,
    hex: `0x${rHex}${sHex}${vHex}`,
  };
}

/**
 * Recover the Ethereum address from a signature and message hash.
 *
 * ECDSA recovery: given (r, s, v) and message hash m, find public key Q.
 * Algorithm: R = ±r point on curve, Q = r^(-1) * (s*R - m*G).
 *
 * Since r = x_R mod n (not mod P), we try x = r and x = r + n as candidates.
 */
export function recoverEthereumAddress(
  msghash: Uint8Array,
  r: bigint,
  sVal: bigint,
  v: number,
): string {
  const recoveryId = v >= 35 ? (v - 35) % 2 : (v - 27) % 2;

  // Convert message hash to scalar
  let m = 0n;
  for (const b of msghash) m = (m << 8n) | BigInt(b);
  m = m % secp.CURVE.n;

  const n = secp.CURVE.n;
  const p = secp.CURVE.p;
  const rMod = r % n;
  if (rMod === 0n) return '0x0000000000000000000000000000000000000000';

  // Try candidates: r, r + n, r + 2n  (secp256k1: n < P so r+n may be < P)
  const xCandidates = [rMod];
  if (rMod + n < p) xCandidates.push(rMod + n);
  if (rMod + 2n * n < p) xCandidates.push(rMod + 2n * n);

  for (const x of xCandidates) {
    const ySquare = ((x * x * x) % p + 7n) % p;
    const y = sqrtModPrime(ySquare, p);
    if (y === null) continue;

    const yEven = (y & 1n) === 0n;
    const yUse = yEven === (recoveryId === 0) ? y : (p - y) % p;

    try {
      const rInv = modInverse2(rMod, n);
      const R = new secp.Point(x, yUse, 1n);
      const G = secp.Point.BASE;

      const sR = R.multiply(sVal % n);
      const mG = G.multiply(m);
      const sR_minus_mG = sR.add(mG.negate());
      const Q = sR_minus_mG.multiply(rInv % n);

      if (!Q.equals(secp.Point.ZERO)) {
        const uncompressed = Buffer.from(Q.toRawBytes(false));
        const hash = sha3_256(uncompressed.subarray(1));
        const addressBytes = hash.subarray(12);
        return '0x' + Buffer.from(addressBytes).toString('hex');
      }
    } catch {
      continue;
    }
  }

  return '0x0000000000000000000000000000000000000000';
}

function sqrtModPrime(n: bigint, p: bigint): bigint | null {
  if (n === 0n) return 0n;
  // Tonelli-Shanks for p % 4 == 3
  if (p % 4n === 3n) {
    const result = modPow2(n, (p + 1n) / 4n, p);
    return (result * result) % p === n ? result : null;
  }
  return null;
}

function modPow2(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

function modInverse2(a: bigint, m: bigint): bigint {
  let [t, newT] = [0n, 1n];
  let [r, newR] = [m, ((a % m) + m) % m];
  while (newR !== 0n) {
    const quotient = r / newR;
    [t, newT] = [newT, t - quotient * newT];
    [r, newR] = [newR, r - quotient * newR];
  }
  if (r > 1n) throw new Error('Not invertible');
  if (t < 0n) t += m;
  return t;
}

// ─── EIP-1559 Transaction Signing ──────────────────────────────────────

/**
 * Compute the EIP-1559 transaction hash (type 2).
 *
 * txHash = keccak256(0x02 || RLP([chainId, nonce, maxPriorityFee, maxFee, gasLimit, to, value, data, accessList]))
 */
export function eip1559TxHash(tx: EIP1559Tx): Uint8Array {
  const encoded = rlpEncode([
    encodeUint(tx.chainId),
    encodeUint(tx.nonce),
    encodeUint(tx.maxPriorityFeePerGas),
    encodeUint(tx.maxFeePerGas),
    encodeUint(tx.gasLimit),
    tx.to === '' ? Buffer.alloc(0) : Buffer.from(tx.to.slice(2), 'hex'),
    encodeUint(tx.value),
    tx.data === '0x' ? Buffer.alloc(0) : Buffer.from(tx.data.slice(2), 'hex'),
    tx.accessList && tx.accessList.length > 0
      ? rlpEncodeList(tx.accessList.map((entry) =>
          rlpEncode([
            Buffer.from(entry.address.slice(2), 'hex'),
            rlpEncodeList(entry.storageKeys.map((k) =>
              rlpEncode(Buffer.from(k.slice(2), 'hex')),
            )),
          ]),
        ))
      : rlpEncode([]),
  ]);

  const typePrefix = Buffer.from([0x02]);
  return sha3_256(Buffer.concat([typePrefix, encoded]));
}

/**
 * Sign an EIP-1559 transaction.
 */
export function signEIP1559Transaction(
  tx: EIP1559Tx,
  partyA: PartyId,
  shareA: bigint,
  partyB: PartyId,
  shareB: bigint,
  publicKey: string,
): EthereumSignature {
  const txhash = eip1559TxHash(tx);
  return signEthereumHash(txhash, partyA, shareA, partyB, shareB, publicKey, tx.chainId);
}

// ─── Legacy Transaction Signing ────────────────────────────────────────

/**
 * Compute the legacy transaction hash (type 0, pre-EIP-155 or EIP-155).
 *
 * legacy txHash = keccak256(RLP([nonce, gasPrice, gasLimit, to, value, data, chainId?, 0, 0]))
 */
export function legacyTxHash(tx: LegacyTx): Uint8Array {
  const fields = [
    encodeUint(tx.nonce),
    encodeUint(tx.gasPrice),
    encodeUint(tx.gasLimit),
    tx.to === '' ? Buffer.alloc(0) : Buffer.from(tx.to.slice(2), 'hex'),
    encodeUint(tx.value),
    tx.data === '0x' ? Buffer.alloc(0) : Buffer.from(tx.data.slice(2), 'hex'),
  ];

  if (tx.chainId !== undefined && tx.chainId > 0) {
    // EIP-155 replay protection
    fields.push(encodeUint(tx.chainId));
    fields.push(Buffer.alloc(0));
    fields.push(Buffer.alloc(0));
  }

  return sha3_256(rlpEncode(fields));
}

/**
 * Sign a legacy transaction.
 */
export function signLegacyTransaction(
  tx: LegacyTx,
  partyA: PartyId,
  shareA: bigint,
  partyB: PartyId,
  shareB: bigint,
  publicKey: string,
): EthereumSignature {
  const txhash = legacyTxHash(tx);
  const chainId = tx.chainId ?? undefined;
  return signEthereumHash(txhash, partyA, shareA, partyB, shareB, publicKey, chainId);
}

// ─── RLP Encoding ──────────────────────────────────────────────────────

function rlpEncode(item: Buffer | Buffer[]): Buffer {
  if (item instanceof Buffer || item instanceof Uint8Array) {
    return rlpEncodeBytes(Buffer.from(item));
  }
  return rlpEncodeList(item.map((i) => rlpEncode(i)));
}

function rlpEncodeBytes(buf: Buffer): Buffer {
  if (buf.length === 0) return Buffer.from([0x80]);
  if (buf.length === 1 && buf[0] < 0x80) return buf;
  if (buf.length <= 55) {
    return Buffer.concat([Buffer.from([0x80 + buf.length]), buf]);
  }
  const lenHex = encodeUint(buf.length);
  return Buffer.concat([Buffer.from([0xb7 + lenHex.length]), lenHex, buf]);
}

function rlpEncodeList(items: Buffer[]): Buffer {
  let combined = Buffer.alloc(0);
  for (const item of items) {
    combined = Buffer.concat([combined, item]);
  }
  if (combined.length <= 55) {
    return Buffer.concat([Buffer.from([0xc0 + combined.length]), combined]);
  }
  const lenHex = encodeUint(combined.length);
  return Buffer.concat([Buffer.from([0xf7 + lenHex.length]), lenHex, combined]);
}

function encodeUint(value: bigint | number): Buffer {
  const n = typeof value === 'number' ? BigInt(value) : value;
  if (n === 0n) return Buffer.alloc(0);
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const buf = Buffer.from(hex, 'hex');
  // Remove leading zero byte if top bit is set (avoid sign confusion)
  if (buf[0] === 0) return buf.subarray(1);
  return buf;
}

// ─── Verify ─────────────────────────────────────────────────────────────

/**
 * Verify an Ethereum signature against a message hash.
 */
export function verifyEthereumSignature(
  publicKeyHex: string,
  msghash: Uint8Array,
  sig: { r: bigint; s: bigint },
): boolean {
  return SigningCeremony.verify(publicKeyHex, msghash, sig);
}

// ─── Re-exports ────────────────────────────────────────────────────────

export { sha3_256 as keccak256 };
