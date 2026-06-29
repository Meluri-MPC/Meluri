/**
 * Key Share Serialization
 *
 * Converts between internal DKG representations and storage/wire formats.
 *
 * Binary format (version 1):
 *   ┌────────────┬──────────────┬───────────────────┬────────────────┐
 *   │ Version(1) │ PartyIdx(1)  │ ShareLen(2,u16 BE)│ Share(var)     │
 *   ├────────────┼──────────────┼───────────────────┼────────────────┤
 *   │ PubKeyLen  │ PublicKey    │ ChainCodeLen (1)  │ ChainCode(var) │
 *   │ (1)        │ (var)        │                   │                │
 *   └────────────┴──────────────┴───────────────────┴────────────────┘
 *
 * Fields:
 *   Version:     1 byte   — Format version (currently 1)
 *   PartyIdx:    1 byte   — Which MPC node (1, 2, or 3)
 *   ShareLen:    2 bytes  — Length of share in bytes (big-endian)
 *   Share:       var      — Raw share bytes (big-endian bigint)
 *   PubKeyLen:   1 byte   — Length of public key
 *   PublicKey:   var      — Compressed secp256k1 public key (33 bytes)
 *   ChainCodeLen: 1 byte  — Length of chain code (0 if absent)
 *   ChainCode:   var      — BIP32 chain code (optional, 32 bytes)
 */

import { CURVE_ORDER } from '../tss/dkg';

export interface SerializedShare {
  version: number;
  partyIndex: number; // 1, 2, or 3
  share: bigint;
  publicKey: Uint8Array;
  chainCode?: Uint8Array;
}

/**
 * Serialize a key share to a binary buffer.
 */
export function serializeShare(data: SerializedShare): Buffer {
  const shareBytes = bigintToBytes(data.share, 32);
  const pubKey = Buffer.from(data.publicKey);

  // Calculate total size
  const ccLen = data.chainCode ? data.chainCode.length : 0;
  const totalSize = 1 + 1 + 2 + shareBytes.length + 1 + pubKey.length + 1 + ccLen;

  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // Version (1 byte)
  buf.writeUInt8(data.version, offset);
  offset += 1;

  // Party index (1 byte)
  buf.writeUInt8(data.partyIndex, offset);
  offset += 1;

  // Share length (2 bytes, big-endian)
  buf.writeUInt16BE(shareBytes.length, offset);
  offset += 2;

  // Share bytes
  shareBytes.copy(buf, offset);
  offset += shareBytes.length;

  // Public key length (1 byte)
  buf.writeUInt8(pubKey.length, offset);
  offset += 1;

  // Public key bytes
  pubKey.copy(buf, offset);
  offset += pubKey.length;

  // Chain code length (1 byte)
  buf.writeUInt8(ccLen, offset);
  offset += 1;

  // Chain code bytes (if present)
  if (data.chainCode && ccLen > 0) {
    Buffer.from(data.chainCode).copy(buf, offset);
    offset += ccLen;
  }

  return buf;
}

/**
 * Deserialize a key share from a binary buffer.
 */
export function deserializeShare(buf: Buffer): SerializedShare {
  let offset = 0;

  // Version
  const version = buf.readUInt8(offset);
  offset += 1;

  if (version !== 1) {
    throw new Error(`Unsupported share version: ${version}`);
  }

  // Party index
  const partyIndex = buf.readUInt8(offset);
  offset += 1;

  // Share
  const shareLen = buf.readUInt16BE(offset);
  offset += 2;
  const shareBytes = buf.subarray(offset, offset + shareLen);
  offset += shareLen;
  const share = bytesToBigint(shareBytes);

  // Validate share is in range [1, n-1]
  if (share <= 0n || share >= CURVE_ORDER) {
    throw new Error(`Deserialized share out of range: 0x${share.toString(16).slice(0, 16)}...`);
  }

  // Public key
  const pubKeyLen = buf.readUInt8(offset);
  offset += 1;
  const publicKey = new Uint8Array(buf.subarray(offset, offset + pubKeyLen));
  offset += pubKeyLen;

  // Chain code
  const ccLen = buf.readUInt8(offset);
  offset += 1;
  let chainCode: Uint8Array | undefined;
  if (ccLen > 0) {
    chainCode = new Uint8Array(buf.subarray(offset, offset + ccLen));
    offset += ccLen;
  }

  return { version, partyIndex, share, publicKey, chainCode };
}

/**
 * Convert a bigint to a fixed-length byte buffer (big-endian).
 */
function bigintToBytes(n: bigint, maxLen: number): Buffer {
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length > maxLen) {
    throw new Error(`Bigint too large: ${bytes.length} > ${maxLen}`);
  }
  if (bytes.length === maxLen) return bytes;
  // Pad with leading zeros
  const padded = Buffer.alloc(maxLen);
  bytes.copy(padded, maxLen - bytes.length);
  return padded;
}

/**
 * Convert a byte buffer to a bigint (big-endian).
 */
function bytesToBigint(buf: Uint8Array): bigint {
  let result = 0n;
  for (const b of buf) {
    result = (result << 8n) | BigInt(b);
  }
  return result;
}

/**
 * Encode a share for storage: serialize → encrypt.
 *
 * @param shareData - The share to encode
 * @param encryptionKey - 256-bit AES key
 * @param salt - HKDF salt
 * @param info - HKDF context info
 * @returns Base64-encoded encrypted serialized share
 */
export function encodeShareForStorage(
  shareData: SerializedShare,
  encryptionKey: Buffer,
  salt: Buffer,
  info: string,
): string {
  const { encryptShare } = require('./encryption');
  const serialized = serializeShare(shareData);
  const blob = encryptShare(serialized, encryptionKey, salt, info);
  return JSON.stringify(blob);
}

/**
 * Decode a share from storage: decrypt → deserialize.
 *
 * @param storedData - The JSON-encoded EncryptedBlob from storage
 * @param encryptionKey - 256-bit AES key (must match encryption key)
 * @returns The deserialized share data
 */
export function decodeShareFromStorage(
  storedData: string,
  encryptionKey: Buffer,
): SerializedShare {
  const { decryptShare } = require('./encryption');
  const blob = JSON.parse(storedData);
  const serialized = decryptShare(blob, encryptionKey);
  return deserializeShare(serialized);
}
