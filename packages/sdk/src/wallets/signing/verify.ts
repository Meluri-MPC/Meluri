import * as crypto from 'crypto';
import * as secp256k1 from '@noble/secp256k1';
import type { ChainType } from '../types';
import { hashMessage, hashStructuredData, buildBip191Message } from './message';

secp256k1.etc.hmacSha256Sync = (k: Uint8Array, ...msgs: Uint8Array[]) => {
  let h = k;
  for (const msg of msgs) {
    const hmac = crypto.createHmac('sha256', Buffer.from(h));
    hmac.update(Buffer.from(msg));
    h = hmac.digest();
  }
  return h;
};

export interface VerificationResult {
  valid: boolean;
  message?: string;
}

export function verifyMessageSignature(
  message: string,
  signature: string,
  expectedPublicKey: string,
  chain?: ChainType
): VerificationResult {
  try {
    const msgHash = hashMessage(message, chain);
    return verifySignatureWithHash(msgHash, signature, expectedPublicKey);
  } catch (e) {
    return { valid: false, message: `Verification error: ${(e as Error).message}` };
  }
}

export function verifyStructuredSignature(
  domain: Record<string, unknown>,
  types: Record<string, Array<{ name: string; type: string }>>,
  primaryType: string,
  message: Record<string, unknown>,
  signature: string,
  expectedPublicKey: string,
  chain?: ChainType
): VerificationResult {
  try {
    const msgHash = hashStructuredData(
      domain as any,
      types as any,
      primaryType,
      message,
      chain
    );
    return verifySignatureWithHash(msgHash, signature, expectedPublicKey);
  } catch (e) {
    return { valid: false, message: `Verification error: ${(e as Error).message}` };
  }
}

export function verifyTransactionSignature(
  txBytes: Uint8Array,
  signature: string,
  expectedPublicKey: string
): VerificationResult {
  try {
    const txHash = crypto.createHash('sha256').update(Buffer.from(txBytes)).digest('hex');
    return verifySignatureWithHash(txHash, signature, expectedPublicKey);
  } catch (e) {
    return { valid: false, message: `Verification error: ${(e as Error).message}` };
  }
}

function verifySignatureWithHash(
  hashHex: string,
  signature: string,
  expectedPublicKey: string
): VerificationResult {
  try {
    let sigBytes: Uint8Array;

    if (signature.startsWith('0x')) {
      sigBytes = Buffer.from(signature.replace(/^0x/, ''), 'hex');
    } else {
      sigBytes = Buffer.from(signature, 'hex');
    }

    if (sigBytes.length === 65) {
      sigBytes = sigBytes.slice(0, 64);
    }

    const pubBytes = Buffer.from(expectedPublicKey.replace(/^0x/, ''), 'hex');
    const hashBytes = Buffer.from(hashHex.replace(/^0x/, ''), 'hex');

    const result = secp256k1.verify(sigBytes, hashBytes, pubBytes);

    if (result) {
      return { valid: true };
    }

    return { valid: false, message: 'Signature verification failed: signature does not match public key' };
  } catch (e) {
    return { valid: false, message: `Verification error: ${(e as Error).message}` };
  }
}

export { hashMessage, hashStructuredData, buildBip191Message } from './message';
