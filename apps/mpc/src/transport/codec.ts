/**
 * Binary Codec — encodes/decodes MPC transport messages.
 *
 * Format (v1):
 *   +--------+--------+----------+-------------+-------------+---------+
 *   | Magic  | Ver(1) | Type(1)  | SessLen(2)  | SessionId   | PayLen(4) | Payload |
 *   | 0x4d504331 |      |          | (u16 BE)    | (UTF-8)     | (u32 BE)  | (JSON)  |
 *   +--------+--------+----------+-------------+-------------+---------+
 *
 * Total header: 4 + 1 + 1 + 2 + var + 4 = 12 + sessionId.length bytes
 */

import { createHmac } from 'crypto';
import { sha256 } from '@noble/hashes/sha256';
import type { MpcMessageEnvelope, SessionEncryptionKeys } from './types';
import { MPC_MAGIC, PROTOCOL_VERSION } from './types';

// ─── Encoding ────────────────────────────────────────────────────────────

/**
 * Encode a message envelope to a binary buffer.
 */
export function encodeMessage(msg: MpcMessageEnvelope, keys?: SessionEncryptionKeys): Buffer {
  const sessionIdBytes = Buffer.from(msg.sessionId, 'utf8');
  const payloadJson = JSON.stringify(msg.payload);
  const payloadBytes = Buffer.from(payloadJson, 'utf8') as Buffer;

  // Optionally encrypt payload with AES-GCM
  let finalPayload = payloadBytes;
  let encrypted = false;
  if (keys) {
    finalPayload = encryptPayload(payloadBytes, keys.encryptionKey);
    encrypted = true;
  }

  // Header: magic(4) + version(1) + type(1) + flags(1) + sessionLen(2) + sessionId(var) + seq(4) + from(1) + to(1) + ts(8) + payloadLen(4)
  const headerSize = 4 + 1 + 1 + 1 + 2 + sessionIdBytes.length + 4 + 1 + 1 + 8 + 4;
  const totalSize = headerSize + finalPayload.length + (keys ? 32 : 0); // +32 for optional HMAC

  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // Magic (4 bytes, big-endian)
  buf.writeUInt32BE(MPC_MAGIC, offset);
  offset += 4;

  // Version (1 byte)
  buf.writeUInt8(msg.version ?? PROTOCOL_VERSION, offset);
  offset += 1;

  // Type (1 byte)
  buf.writeUInt8(msg.type, offset);
  offset += 1;

  // Flags (1 byte): bit 0 = encrypted, bit 1-7 = reserved
  let flags = 0;
  if (encrypted) flags |= 0x01;
  buf.writeUInt8(flags, offset);
  offset += 1;

  // Session ID length + value
  buf.writeUInt16BE(sessionIdBytes.length, offset);
  offset += 2;
  sessionIdBytes.copy(buf, offset);
  offset += sessionIdBytes.length;

  // Sequence (4 bytes)
  buf.writeUInt32BE(msg.sequence, offset);
  offset += 4;

  // From (1 byte)
  buf.writeUInt8(msg.from, offset);
  offset += 1;

  // To (1 byte)
  buf.writeUInt8(msg.to, offset);
  offset += 1;

  // Timestamp (8 bytes, big-endian)
  buf.writeBigUInt64BE(BigInt(msg.timestamp), offset);
  offset += 8;

  // Payload length + value
  buf.writeUInt32BE(finalPayload.length, offset);
  offset += 4;
  finalPayload.copy(buf, offset);
  offset += finalPayload.length;

  // Optional HMAC
  if (keys) {
    const body = buf.subarray(0, offset);
    const hmac = hmacSha256(keys.hmacKey, body);
    hmac.copy(buf, offset);
  }

  return buf;
}

/**
 * Decode a message from a binary buffer.
 */
export function decodeMessage(
  buf: Buffer,
  keys?: SessionEncryptionKeys,
): MpcMessageEnvelope {
  if (buf.length < 5) throw new Error('Message too short');

  let offset = 0;

  // Magic
  const magic = buf.readUInt32BE(offset);
  offset += 4;
  if (magic !== MPC_MAGIC) {
    throw new Error(`Invalid magic: 0x${magic.toString(16)}`);
  }

  // Version
  const version = buf.readUInt8(offset);
  offset += 1;

  // Type
  const type = buf.readUInt8(offset);
  offset += 1;

  // Flags
  const flags = buf.readUInt8(offset);
  offset += 1;
  const isEncrypted = !!(flags & 0x01);

  // Session ID
  const sessionIdLen = buf.readUInt16BE(offset);
  offset += 2;
  const sessionId = buf.subarray(offset, offset + sessionIdLen).toString('utf8');
  offset += sessionIdLen;

  // Sequence
  const sequence = buf.readUInt32BE(offset);
  offset += 4;

  // From
  const from = buf.readUInt8(offset);
  offset += 1;

  // To
  const to = buf.readUInt8(offset);
  offset += 1;

  // Timestamp
  const timestamp = Number(buf.readBigUInt64BE(offset));
  offset += 8;

  // Payload
  const payloadLen = buf.readUInt32BE(offset);
  offset += 4;
  let payloadBytes = buf.subarray(offset, offset + payloadLen);
  offset += payloadLen;

  // Verify HMAC if keys provided
  if (keys) {
    const bodyEnd = offset; // offset is now past the payload, before HMAC
    if (buf.length >= bodyEnd + 32) {
      const body = buf.subarray(0, bodyEnd);
      const expectedHmac = hmacSha256(keys.hmacKey, body);
      const actualHmac = buf.subarray(bodyEnd, bodyEnd + 32);
      if (Buffer.compare(expectedHmac, actualHmac) !== 0) {
        throw new Error('HMAC verification failed');
      }
    }
  }

  // Decrypt payload if needed
  if (isEncrypted) {
    if (!keys) throw new Error('Encrypted message requires decryption keys');
    payloadBytes = decryptPayload(payloadBytes, keys.encryptionKey);
  }

  const payload = JSON.parse(payloadBytes.toString('utf8'));

  return {
    version,
    type,
    sessionId,
    from,
    to,
    sequence,
    timestamp,
    payload,
  };
}

// ─── Payload Encryption ──────────────────────────────────────────────────

function encryptPayload(plaintext: Buffer, key: Uint8Array): Buffer {
  const { createCipheriv, randomBytes } = require('crypto');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: IV(12) || ciphertext || tag(16)
  return Buffer.concat([iv, encrypted, tag]);
}

function decryptPayload(ciphertext: Buffer, key: Uint8Array): Buffer {
  const { createDecipheriv } = require('crypto');
  const iv = ciphertext.subarray(0, 12);
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(12, ciphertext.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function hmacSha256(key: Uint8Array, data: Buffer): Buffer {
  const hmac = createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest();
}

// ─── Session Key Generation ──────────────────────────────────────────────

/**
 * Generate session encryption keys from a shared secret.
 */
export function generateSessionKeys(
  sharedSecret: Uint8Array,
): SessionEncryptionKeys {
  const { hkdfSync } = require('crypto');
  const encKey = hkdfSync('sha256', sharedSecret, Buffer.alloc(0), 'mpc-encryption', 32);
  const hmacKey = hkdfSync('sha256', sharedSecret, Buffer.alloc(0), 'mpc-hmac', 32);
  return {
    encryptionKey: new Uint8Array(encKey),
    hmacKey: new Uint8Array(hmacKey),
    rotationIntervalMs: 0,
    lastRotated: Date.now(),
  };
}
