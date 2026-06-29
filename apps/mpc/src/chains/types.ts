/**
 * Multi-chain type definitions for the MPC signing layer.
 *
 * Supported curves:
 *   - secp256k1: Stacks, Bitcoin, Ethereum, and other EVM chains
 *   - ed25519:   Solana, Sui, Aptos, and other EdDSA-based chains
 */

export type CurveType = 'secp256k1' | 'ed25519';

export type ChainId =
  | 'stacks'
  | 'bitcoin'
  | 'ethereum'
  | 'solana'
  | 'sui'
  | 'aptos';

export interface ChainConfig {
  /** Canonical chain identifier */
  id: ChainId;
  /** Human-readable name */
  name: string;
  /** Curve used for key generation and signing */
  curve: CurveType;
  /** BIP44 coin type */
  coinType: number;
  /** Default derivation path (e.g. m/44'/5757'/0'/0/0) */
  derivationPath: string;
  /** Stacks-specific address version byte */
  addressVersion?: number;
  /** Whether the chain is active (can be toggled for progressive rollout) */
  enabled: boolean;
  /** Hex-encoded chain ID for transaction signing (e.g. '0x1' for Stacks mainnet) */
  chainIdHex?: string;
}

/** ECDSA (secp256k1) signature components */
export interface EcdsaSignature {
  curve: 'secp256k1';
  /** r component (bigint) */
  r: bigint;
  /** s component (bigint, low-S normalized per BIP62) */
  s: bigint;
  /** Recovery ID (0 or 1) */
  recoveryId: number;
  /** DER-encoded hex signature */
  hex: string;
}

/** EdDSA (Ed25519) signature */
export interface EddsaSignature {
  curve: 'ed25519';
  /** Raw 64-byte Ed25519 signature */
  signature: Uint8Array;
  /** Hex-encoded signature */
  hex: string;
}

/** Union type for any supported signature */
export type ChainSignature = EcdsaSignature | EddsaSignature;
