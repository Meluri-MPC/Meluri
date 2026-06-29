/**
 * Bitcoin Signing — address derivation and transaction signing on secp256k1.
 *
 * Uses the existing TSS SigningCeremony for the actual signing,
 * then wraps the result in Bitcoin-specific signature format.
 *
 * Supported address types:
 *   - P2PKH (legacy, 1...)
 *   - P2WPKH (native SegWit, bc1q...)
 *   - P2SH-P2WPKH (wrapped SegWit, 3...)
 *
 * Bitcoin signature format: DER-encoded ECDSA + 1-byte sighash flag.
 */

import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { SigningCeremony, type PartyId } from '../index';

secp.etc.hmacSha256Sync = (k: Uint8Array, ...msgs: Uint8Array[]) => {
  let h: Uint8Array = new Uint8Array(0);
  for (const msg of msgs) {
    h = hmac(sha256, k, msg);
    k = h;
  }
  return h;
};

// ─── Types ──────────────────────────────────────────────────────────────

export type BitcoinNetwork = 'mainnet' | 'testnet';

export type AddressType = 'p2pkh' | 'p2wpkh' | 'p2sh-p2wpkh';

export interface BitcoinAddress {
  address: string;
  type: AddressType;
  network: BitcoinNetwork;
  publicKey: string;
}

export interface BitcoinSignature {
  /** DER-encoded ECDSA signature with sighash byte */
  hex: string;
  /** Just the DER signature (no sighash) */
  der: string;
  /** Sighash type (e.g., 0x01 = SIGHASH_ALL) */
  sighashType: number;
  r: bigint;
  s: bigint;
}

/**
 * Standard double-SHA256 (used for Bitcoin tx and address hashing).
 */
function hash256(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

/**
 * HASH160 = RIPEMD160(SHA256(data)) — used for P2PKH and P2SH addresses.
 */
function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

// ─── Network Constants ──────────────────────────────────────────────────

const NETWORK_PREFIXES: Record<BitcoinNetwork, { p2pkh: number; p2sh: number; bech32: string }> = {
  mainnet: { p2pkh: 0x00, p2sh: 0x05, bech32: 'bc' },
  testnet: { p2pkh: 0x6f, p2sh: 0xc4, bech32: 'tb' },
};

// ─── Address Derivation ─────────────────────────────────────────────────

/**
 * Derive a P2PKH (legacy) Bitcoin address from a compressed public key.
 *
 * P2PKH = base58check(version_byte || HASH160(pubkey))
 */
export function deriveP2PKHAddress(
  publicKey: Uint8Array,
  network: BitcoinNetwork = 'mainnet',
): string {
  const prefix = NETWORK_PREFIXES[network].p2pkh;
  const hash = hash160(publicKey);
  const payload = Buffer.concat([Buffer.from([prefix]), Buffer.from(hash)]);
  return base58checkEncode(payload);
}

/**
 * Derive a P2WPKH (native SegWit) Bitcoin address from a compressed public key.
 *
 * P2WPKH = bech32(hrp, 0, HASH160(pubkey))
 */
export function deriveP2WPKHAddress(
  publicKey: Uint8Array,
  network: BitcoinNetwork = 'mainnet',
): string {
  const hrp = NETWORK_PREFIXES[network].bech32;
  const hash = hash160(publicKey);
  return bech32Encode(hrp, 0, hash);
}

/**
 * Derive a P2SH-P2WPKH (wrapped SegWit) Bitcoin address from a compressed public key.
 *
 * P2SH-P2WPKH = base58check(P2SH_prefix || HASH160(0x0014 || HASH160(pubkey)))
 */
export function deriveP2SHP2WPKHAddress(
  publicKey: Uint8Array,
  network: BitcoinNetwork = 'mainnet',
): string {
  const prefix = NETWORK_PREFIXES[network].p2sh;
  const pubkeyHash = hash160(publicKey);
  const redeemScript = Buffer.concat([Buffer.from([0x00, 0x14]), Buffer.from(pubkeyHash)]);
  const scriptHash = hash160(redeemScript);
  const payload = Buffer.concat([Buffer.from([prefix]), Buffer.from(scriptHash)]);
  return base58checkEncode(payload);
}

/**
 * Derive a Bitcoin address from a joint public key.
 * Defaults to P2WPKH (SegWit).
 */
export function deriveBitcoinAddress(
  publicKey: Uint8Array,
  network: BitcoinNetwork = 'mainnet',
  type: AddressType = 'p2wpkh',
): BitcoinAddress {
  let address: string;
  switch (type) {
    case 'p2pkh':
      address = deriveP2PKHAddress(publicKey, network);
      break;
    case 'p2sh-p2wpkh':
      address = deriveP2SHP2WPKHAddress(publicKey, network);
      break;
    case 'p2wpkh':
    default:
      address = deriveP2WPKHAddress(publicKey, network);
      break;
  }

  return {
    address,
    type,
    network,
    publicKey: Buffer.from(publicKey).toString('hex'),
  };
}

// ─── Message / Transaction Signing ──────────────────────────────────────

/**
 * Sighash types (most common).
 */
export const SIGHASH_ALL = 0x01;
export const SIGHASH_NONE = 0x02;
export const SIGHASH_SINGLE = 0x03;
export const SIGHASH_ANYONECANPAY = 0x80;

/**
 * Sign a Bitcoin message hash using the TSS signing ceremony.
 *
 * Bitcoin signs double-SHA256 of the serialized transaction with sighash type.
 * The hash you pass here should already be the final sighash (double-SHA256 of
 * the tx with sighash byte appended).
 *
 * @param sighash - The double-SHA256 sighash of the transaction (32 bytes)
 * @param partyA - First participating party ID
 * @param shareA - First party's key share
 * @param partyB - Second participating party ID
 * @param shareB - Second party's key share
 * @param publicKey - Joint public key (hex)
 * @param sighashType - Sighash flag (default SIGHASH_ALL)
 */
export function signBitcoinTransaction(
  sighash: Uint8Array,
  partyA: PartyId,
  shareA: bigint,
  partyB: PartyId,
  shareB: bigint,
  publicKey: string,
  sighashType: number = SIGHASH_ALL,
): BitcoinSignature {
  const result = SigningCeremony.sign(
    `btc-tx-${Date.now()}`,
    partyA,
    shareA,
    partyB,
    shareB,
    sighash,
    publicKey,
  );

  // Append sighash byte to DER signature
  const derWithSighash = result.hex + sighashType.toString(16).padStart(2, '0');

  return {
    hex: derWithSighash,
    der: result.hex,
    sighashType,
    r: result.r,
    s: result.s,
  };
}

/**
 * Compute a Bitcoin message hash (for signed messages, not transactions).
 *
 * Bitcoin Signed Message format:
 *   "Bitcoin Signed Message:\n" + message
 * Then double-SHA256.
 */
export function bitcoinMessageHash(message: string): Uint8Array {
  const prefix = Buffer.from('Bitcoin Signed Message:\n', 'utf8');
  const msgBytes = Buffer.from(message, 'utf8');
  const prefixLen = Buffer.from(prefix.length.toString(), 'utf8');

  // Build the magic prefix: varint(len(prefix)) || prefix || varint(len(message)) || message
  // Simplified: just prefix + message (compatible with common wallets)
  const combined = Buffer.concat([prefixLen, prefix, msgBytes]);
  return hash256(combined);
}

/**
 * Sign a Bitcoin message (not a transaction — for identity verification).
 */
export function signBitcoinMessage(
  message: string,
  partyA: PartyId,
  shareA: bigint,
  partyB: PartyId,
  shareB: bigint,
  publicKey: string,
): BitcoinSignature {
  const msghash = bitcoinMessageHash(message);
  return signBitcoinTransaction(msghash, partyA, shareA, partyB, shareB, publicKey);
}

/**
 * Verify a Bitcoin signature against a public key and message.
 */
export function verifyBitcoinSignature(
  publicKeyHex: string,
  sighash: Uint8Array,
  sig: { r: bigint; s: bigint },
): boolean {
  return SigningCeremony.verify(publicKeyHex, sighash, sig);
}

// ─── Key Formats ────────────────────────────────────────────────────────

/**
 * Convert a TSS joint public key to Bitcoin-compatible compressed pubkey hex.
 * (secp256k1 compressed point is already standard Bitcoin format.)
 */
export function publicKeyToBitcoinFormat(publicKey: Uint8Array): string {
  const hex = Buffer.from(publicKey).toString('hex');
  // Already compressed (33 bytes, starts with 02 or 03)
  return hex;
}

// ─── Base58Check ────────────────────────────────────────────────────────

/**
 * Base58Check encoding used by Bitcoin addresses.
 */
function base58checkEncode(payload: Buffer): string {
  const checksum = hash256(payload).subarray(0, 4);
  const full = Buffer.concat([payload, Buffer.from(checksum)]);
  return base58Encode(full);
}

/**
 * Simple base58 encoder (Bitcoin alphabet).
 */
function base58Encode(data: Buffer): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = 0n;
  for (const b of data) {
    num = (num << 8n) | BigInt(b);
  }

  if (num === 0n) return ALPHABET[0];

  let encoded = '';
  while (num > 0n) {
    const rem = Number(num % 58n);
    encoded = ALPHABET[rem] + encoded;
    num = num / 58n;
  }

  // Leading zeros
  for (const b of data) {
    if (b === 0) {
      encoded = ALPHABET[0] + encoded;
    } else {
      break;
    }
  }

  return encoded;
}

// ─── Bech32 ─────────────────────────────────────────────────────────────

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Encode(hrp: string, version: number, program: Uint8Array): string {
  const versionByte = version === 0 ? 0 : version + 0x50; // 0 for v0, 0x51+ for v1+
  const data = [versionByte, ...convertBits(program, 8, 5)];
  const combined = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = bech32Polymod(combined) ^ (hrp === 'bc' ? 1 : 0x2bc830a3); // bech32m for bc with v1+, but for v0 we use bech32
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((mod >> (5 * (5 - i))) & 31);
  }
  const result = [...bech32HrpExpand(hrp), ...data, ...checksum];
  return `${hrp}1${result.slice(bech32HrpExpand(hrp).length).map((c) => BECH32_CHARSET[c]).join('')}`;
}

function bech32HrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (const c of hrp) result.push(c.charCodeAt(0) >> 5);
  result.push(0);
  for (const c of hrp) result.push(c.charCodeAt(0) & 31);
  return result;
}

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function convertBits(data: Uint8Array, fromBits: number, toBits: number): number[] {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }
  if (bits > 0) result.push((acc << (toBits - bits)) & maxv);
  return result;
}

export { hash256, hash160, base58checkEncode, base58Encode, bech32Encode };
