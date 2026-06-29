/**
 * Abstract signing interface — unified types for ECDSA and EdDSA signing ceremonies.
 *
 * This layer allows the wallet orchestrator to call `sign()` regardless of
 * whether the underlying chain uses secp256k1 or Ed25519.
 */

import type { ChainId, ChainSignature } from '../chains/types';
import type { SigningResult } from './index';

export type { SigningResult };

/**
 * Request to sign a message for a specific chain.
 */
export interface SignRequest {
  /** MPC wallet identifier */
  walletId: string;
  /** Target chain (determines curve and signature format) */
  chain: ChainId;
  /** Message to sign (typically a pre-hashed transaction digest) */
  message: Uint8Array;
}

/**
 * Result of a signing operation — union over all supported curves.
 */
export interface MultiChainSignResult {
  /** Wallet ID that was signed for */
  walletId: string;
  /** Chain the signature was produced for */
  chain: ChainId;
  /** The signature in chain-appropriate format */
  signature: ChainSignature;
  /** Public key that can verify this signature */
  publicKey: Uint8Array;
}

/**
 * Key generation result for a specific curve.
 */
export interface KeyGenResult {
  /** Type of curve used */
  curve: 'secp256k1' | 'ed25519';
  /** Public key bytes */
  publicKey: Uint8Array;
  /** Private key or key share (for EdDSA, the raw 32-byte seed) */
  privateKey: Uint8Array;
}

/**
 * Verify a signature against a message, public key, and chain.
 */
export interface VerifyRequest {
  chain: ChainId;
  message: Uint8Array;
  signature: ChainSignature;
  publicKey: Uint8Array;
}
