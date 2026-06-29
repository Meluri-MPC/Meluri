/**
 * EdDSA (Ed25519) — key generation, signing, and verification.
 *
 * Uses Node.js built-in crypto module for native Ed25519 support.
 * This provides a non-TSS reference implementation for chains that
 * use Ed25519 (Solana, Sui, Aptos).
 *
 * In production, Ed25519 TSS would use the FROST protocol for distributed
 * key generation and signing. This standalone implementation serves as:
 *   1. A reference for verification
 *   2. A fallback for non-TSS wallet modes
 *   3. Test fixtures for future FROST integration
 *
 * Ed25519 specifics:
 *   - 256-bit seed (32 bytes)
 *   - 256-bit public key (32 bytes)
 *   - 512-bit signatures (64 bytes)
 *   - Deterministic nonce (RFC 8032)
 *   - No recovery ID needed
 */

import {
  generateKeyPairSync,
  sign,
  verify,
  createPublicKey,
  createPrivateKey,
} from 'crypto';
import type { KeyObject } from 'crypto';

// ─── Types ──────────────────────────────────────────────────────────────

export interface Ed25519Keypair {
  /** 32-byte seed as hex */
  privateKey: string;
  /** 32-byte public key as hex */
  publicKey: string;
  /** 32-byte seed as raw bytes */
  privateKeyBytes: Uint8Array;
  /** 32-byte public key as raw bytes */
  publicKeyBytes: Uint8Array;
}

export interface Ed25519Signature {
  /** 64-byte signature as raw bytes */
  signature: Uint8Array;
  /** 64-byte signature as hex */
  hex: string;
}

// ─── ASN.1 DER Helpers ──────────────────────────────────────────────────

/**
 * Ed25519 OID: 1.3.101.112
 */
const ED25519_OID = Buffer.from('06032b6570', 'hex');

/**
 * Build SPKI DER for an Ed25519 public key (32 raw bytes).
 *
 *   SEQUENCE {
 *     SEQUENCE { OID 1.3.101.112 }
 *     BIT STRING { 0x00 <32-byte pubkey> }
 *   }
 */
function buildSpkiDer(pubKeyBytes: Buffer): Buffer {
  const algorithm = Buffer.concat([
    Buffer.from('3005', 'hex'), // SEQUENCE (5)
    ED25519_OID,
  ]);
  const bitString = Buffer.concat([
    Buffer.from([0x00]), // unused bits = 0
    pubKeyBytes,
  ]);

  const inner = Buffer.concat([algorithm, asn1BitString(bitString)]);
  return asn1Sequence(inner);
}

/**
 * Build PKCS8 DER for an Ed25519 private key seed (32 raw bytes).
 *
 *   SEQUENCE {
 *     INTEGER 0
 *     SEQUENCE { OID 1.3.101.112 }
 *     OCTET STRING { OCTET STRING { <32-byte seed> } }
 *   }
 */
function buildPkcs8Der(seedBytes: Buffer): Buffer {
  const version = Buffer.from('020100', 'hex'); // INTEGER 0
  const algorithm = Buffer.concat([
    Buffer.from('3005', 'hex'), // SEQUENCE (5)
    ED25519_OID,
  ]);
  const innerOctet = asn1OctetString(seedBytes);
  const outerOctet = asn1OctetString(innerOctet);

  const inner = Buffer.concat([version, algorithm, outerOctet]);
  return asn1Sequence(inner);
}

function asn1Sequence(content: Buffer): Buffer {
  const len = encodeAsn1Length(content.length);
  return Buffer.concat([Buffer.from([0x30]), len, content]);
}

function asn1OctetString(content: Buffer): Buffer {
  const len = encodeAsn1Length(content.length);
  return Buffer.concat([Buffer.from([0x04]), len, content]);
}

function asn1BitString(content: Buffer): Buffer {
  const len = encodeAsn1Length(content.length);
  return Buffer.concat([Buffer.from([0x03]), len, content]);
}

function encodeAsn1Length(length: number): Buffer {
  if (length < 128) return Buffer.from([length]);
  const lenBytes: number[] = [];
  let l = length;
  while (l > 0) {
    lenBytes.unshift(l & 0xff);
    l >>= 8;
  }
  return Buffer.from([0x80 | lenBytes.length, ...lenBytes]);
}

/**
 * Create a KeyObject from raw DER bytes.
 */
function keyObjectFromDer(der: Buffer, type: 'public' | 'private'): KeyObject {
  if (type === 'public') {
    return createPublicKey({
      key: der,
      format: 'der',
      type: 'spki',
    });
  }
  return createPrivateKey({
    key: der,
    format: 'der',
    type: 'pkcs8',
  });
}

// ─── Key Generation ────────────────────────────────────────────────────

/**
 * Generate a new Ed25519 keypair.
 */
export function generateEd25519Keypair(): Ed25519Keypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  const pubRaw = extractEd25519PublicKey(publicKey);
  const privRaw = extractEd25519PrivateKey(privateKey);

  return {
    privateKey: Buffer.from(privRaw).toString('hex'),
    publicKey: Buffer.from(pubRaw).toString('hex'),
    privateKeyBytes: privRaw,
    publicKeyBytes: pubRaw,
  };
}

/**
 * Import an Ed25519 keypair from a raw 32-byte seed.
 */
export function importEd25519Keypair(seed: Uint8Array): Ed25519Keypair {
  if (seed.length !== 32) {
    throw new Error(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  }

  const seedBuf = Buffer.from(seed);

  // Build proper PKCS8 DER from the raw seed
  const pkcs8Der = buildPkcs8Der(seedBuf);
  const privateKey = createPrivateKey({
    key: pkcs8Der,
    format: 'der',
    type: 'pkcs8',
  });

  const publicKey = createPublicKey(privateKey as any);
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const pubRaw = extractEd25519PublicKey(spkiDer);

  return {
    privateKey: Buffer.from(seed).toString('hex'),
    publicKey: Buffer.from(pubRaw).toString('hex'),
    privateKeyBytes: new Uint8Array(seed),
    publicKeyBytes: pubRaw,
  };
}

/**
 * Get the public key from a raw 32-byte seed.
 */
export function getEd25519PublicKey(seed: Uint8Array): Uint8Array {
  return importEd25519Keypair(seed).publicKeyBytes;
}

// ─── Signing ────────────────────────────────────────────────────────────

/**
 * Sign a message using Ed25519.
 *
 * @param message - The message to sign (arbitrary bytes)
 * @param keypair - The Ed25519 keypair or private key material
 */
export function signEd25519(
  message: Uint8Array,
  keypair: Ed25519Keypair | { privateKey: string } | { privateKeyBytes: Uint8Array },
): Ed25519Signature {
  let seedBytes: Buffer;

  if ('privateKeyBytes' in keypair) {
    seedBytes = Buffer.from(keypair.privateKeyBytes);
  } else if ('privateKey' in keypair) {
    seedBytes = Buffer.from(keypair.privateKey, 'hex');
  } else {
    throw new Error('Invalid keypair: no private key material');
  }

  const pkcs8Der = buildPkcs8Der(seedBytes);
  const privateKey = createPrivateKey({
    key: pkcs8Der,
    format: 'der',
    type: 'pkcs8',
  });

  const signature = sign(null, Buffer.from(message), privateKey);

  return {
    signature: new Uint8Array(signature),
    hex: signature.toString('hex'),
  };
}

// ─── Verification ──────────────────────────────────────────────────────

/**
 * Verify an Ed25519 signature.
 *
 * @param message - The original message that was signed
 * @param signature - 64-byte signature (or Ed25519Signature type)
 * @param publicKey - 32-byte public key (Uint8Array or hex string)
 */
export function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array | Ed25519Signature,
  publicKey: Uint8Array | string,
): boolean {
  const sigBytes =
    'signature' in (signature as Ed25519Signature)
      ? (signature as Ed25519Signature).signature
      : (signature as Uint8Array);

  const pubKeyBytes: Buffer =
    typeof publicKey === 'string'
      ? Buffer.from(publicKey, 'hex')
      : Buffer.from(publicKey);

  try {
    const spkiDer = buildSpkiDer(pubKeyBytes);
    const pubKeyObj = createPublicKey({
      key: spkiDer,
      format: 'der',
      type: 'spki',
    });

    return verify(null, Buffer.from(message), pubKeyObj, Buffer.from(sigBytes));
  } catch {
    return false;
  }
}

// ─── Seed Generation ───────────────────────────────────────────────────

/**
 * Generate a random 32-byte Ed25519 seed.
 */
export function generateEd25519Seed(): Uint8Array {
  const { privateKeyBytes } = generateEd25519Keypair();
  return privateKeyBytes;
}

// ─── DER Extraction Helpers ────────────────────────────────────────────

/**
 * Extract raw 32-byte public key from SPKI DER.
 */
function extractEd25519PublicKey(derPublicKey: Buffer | string): Uint8Array {
  const buf = typeof derPublicKey === 'string' ? Buffer.from(derPublicKey, 'hex') : derPublicKey;
  return new Uint8Array(buf.subarray(buf.length - 32));
}

/**
 * Extract raw 32-byte private key (seed) from PKCS8 DER.
 */
function extractEd25519PrivateKey(derPrivateKey: Buffer | string): Uint8Array {
  const buf = typeof derPrivateKey === 'string' ? Buffer.from(derPrivateKey, 'hex') : derPrivateKey;
  return new Uint8Array(buf.subarray(buf.length - 32));
}
