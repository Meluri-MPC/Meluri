/**
 * Node Identity — Ed25519 keypair generation and TLS certificate management.
 *
 * Each MPC node has:
 *   1. An Ed25519 keypair for peer authentication (signs protocol challenge)
 *   2. Optionally, a self-signed TLS certificate for transport encryption
 *
 * In production, TLS certs come from a CA (cert-manager + Let's Encrypt).
 * For development, we generate self-signed certificates.
 */

import {
  generateKeyPairSync,
  sign,
  verify,
  randomBytes,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from 'crypto';
import type { NodeIdentity } from './types';

// ─── Ed25519 Identity ─────────────────────────────────────────────────────

export interface Ed25519Identity {
  /** 32-byte private key seed (hex) */
  privateKey: string;
  /** 32-byte public key (hex) */
  publicKey: string;
  /** 32-byte public key as raw bytes */
  publicKeyBytes: Uint8Array;
}

/**
 * Generate a fresh Ed25519 identity for a node.
 */
export function generateNodeIdentity(): Ed25519Identity {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubRaw = extractEd25519PublicKey(
    publicKey.export({ type: 'spki', format: 'der' }),
  );
  const privRaw = extractEd25519PrivateKey(
    privateKey.export({ type: 'pkcs8', format: 'der' }),
  );

  return {
    privateKey: Buffer.from(privRaw).toString('hex'),
    publicKey: Buffer.from(pubRaw).toString('hex'),
    publicKeyBytes: new Uint8Array(pubRaw),
  };
}

/**
 * Sign a challenge with the node's Ed25519 private key.
 * Used for peer authentication during connection handshake.
 */
export function signChallenge(
  challenge: Uint8Array,
  privateKeyHex: string,
): Buffer {
  const pkcs8Der = buildPkcs8Der(Buffer.from(privateKeyHex, 'hex'));
  const privateKey = createPrivateKey({
    key: pkcs8Der,
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, Buffer.from(challenge), privateKey);
}

/**
 * Verify a challenge signature against a node's Ed25519 public key.
 */
export function verifyChallenge(
  challenge: Uint8Array,
  signature: Uint8Array,
  publicKeyHex: string,
): boolean {
  try {
    const spkiDer = buildSpkiDer(Buffer.from(publicKeyHex, 'hex'));
    const publicKey = createPublicKey({
      key: spkiDer,
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(challenge), publicKey, Buffer.from(signature));
  } catch {
    return false;
  }
}

// ─── Node Registration ────────────────────────────────────────────────────

/**
 * Create a NodeIdentity from configuration.
 */
export function createNodeIdentity(
  partyId: number,
  host: string,
  port: number,
  region: string,
  ed25519Identity?: Ed25519Identity,
): NodeIdentity {
  const id = ed25519Identity ?? generateNodeIdentity();
  return {
    partyId,
    name: `mpc-node-${partyId - 1}`,
    ed25519PublicKey: id.publicKey,
    region,
    host,
    port,
    uri: `ws://${host}:${port}`,
  };
}

// ─── Peer Authentication Protocol ─────────────────────────────────────────

/**
 * Generate an authentication challenge for a peer.
 *
 * Protocol:
 *   1. Node A generates 32 random bytes (challenge)
 *   2. Node A sends challenge to Node B
 *   3. Node B signs challenge with its Ed25519 key
 *   4. Node B returns signature
 *   5. Node A verifies signature against Node B's known public key
 */
export function generateAuthChallenge(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

/**
 * Verify a peer's authentication response.
 */
export function authenticatePeer(
  identity: Ed25519Identity,
  challenge: Uint8Array,
): Buffer {
  return signChallenge(challenge, identity.privateKey);
}

// ─── DER Encoding Helpers ─────────────────────────────────────────────────

const ED25519_OID = Buffer.from('06032b6570', 'hex');

function buildSpkiDer(pubKeyBytes: Buffer): Buffer {
  const algorithm = Buffer.concat([
    Buffer.from('3005', 'hex'),
    ED25519_OID,
  ]);
  const bitString = Buffer.concat([
    Buffer.from([0x00]),
    pubKeyBytes,
  ]);
  const inner = Buffer.concat([algorithm, asn1BitString(bitString)]);
  return asn1Sequence(inner);
}

function buildPkcs8Der(seedBytes: Buffer): Buffer {
  const version = Buffer.from('020100', 'hex');
  const algorithm = Buffer.concat([
    Buffer.from('3005', 'hex'),
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

function extractEd25519PublicKey(derPublicKey: Buffer | string): Uint8Array {
  const buf = typeof derPublicKey === 'string' ? Buffer.from(derPublicKey, 'hex') : derPublicKey;
  return new Uint8Array(buf.subarray(buf.length - 32));
}

function extractEd25519PrivateKey(derPrivateKey: Buffer | string): Uint8Array {
  const buf = typeof derPrivateKey === 'string' ? Buffer.from(derPrivateKey, 'hex') : derPrivateKey;
  return new Uint8Array(buf.subarray(buf.length - 32));
}
