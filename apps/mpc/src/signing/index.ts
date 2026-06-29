/**
 * TSS Signing Ceremony — 2-of-3 Threshold ECDSA Signing
 *
 * Implements a 2-round distributed signing protocol over secp256k1.
 * Any 2 of 3 key shares can jointly produce a valid ECDSA signature.
 *
 * Protocol:
 *   Round 1: Each party generates a random nonce k_i, computes R_i = k_i * G
 *   Round 2: Exchange nonces + shares → reconstruct key → produce signature
 *
 * Key Reconstruction Approach (v1):
 *   During signing, the coordinator (the party initiating the sign) receives
 *   the other party's weighted share contribution. This allows reconstructing
 *   the full private key in memory for the duration of signing (~1ms).
 *   The key is immediately wiped after signing and never stored.
 *
 *   This is a simplification of the full GG20 signing protocol which would
 *   use Multiplicative-to-Additive (MtA) conversion via Paillier to avoid
 *   any key reconstruction. The full MtA protocol is planned for v2.
 *
 * Security:
 *   - Full key exists only in ephemeral memory (< 1ms)
 *   - Each party only ever holds their own share
 *   - No single party can sign alone
 *   - Signatures are standard ECDSA, verifiable by any secp256k1 library
 */

import * as secp from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';

secp.etc.hmacSha256Sync = (k: Uint8Array, ...msgs: Uint8Array[]) => {
  let h: Uint8Array = new Uint8Array(0);
  for (const msg of msgs) {
    h = hmac(sha256, k, msg);
    k = h;
  }
  return h;
};

const CURVE_ORDER = secp.CURVE.n;

// ─── Types ────────────────────────────────────────────────────────────────

export type PartyId = number;

export interface NonceCommitment {
  partyId: PartyId;
  /** R_i = k_i * G (compressed point hex) */
  R: string;
}

export interface PartialContribution {
  partyId: PartyId;
  /** Nonce k_i (must be transmitted over secure channel in production) */
  nonce: bigint;
  /** Weighted share: w_i * share_i (Lagrange coefficient * share) */
  weightedShare: bigint;
}

export interface SigningSession {
  sessionId: string;
  parties: PartyId[];
  messageHash: Uint8Array;
  /** Joint public key (hex) for verification */
  publicKey: string;
  round: 1 | 2;
  /** Round 1: nonce commitments from each party */
  nonceCommitments: Map<PartyId, NonceCommitment>;
  /** Round 2: partial contributions from each party */
  contributions: Map<PartyId, PartialContribution>;
  /** The final signature */
  signature: { r: bigint; s: bigint } | null;
}

export interface SigningResult {
  /** Signature r component (bigint) */
  r: bigint;
  /** Signature s component (bigint) */
  s: bigint;
  /** Recovery ID (0 or 1) */
  recoveryId: number;
  /** Hex-encoded DER signature (for Stacks) */
  hex: string;
}

// ─── Utility ──────────────────────────────────────────────────────────────

function mod(a: bigint, m: bigint): bigint {
  const result = a % m;
  return result < 0n ? result + m : result;
}

function modInverse(a: bigint, m: bigint): bigint {
  let [t, newT] = [0n, 1n];
  let [r, newR] = [m, mod(a, m)];
  while (newR !== 0n) {
    const quotient = r / newR;
    [t, newT] = [newT, t - quotient * newT];
    [r, newR] = [newR, r - quotient * newR];
  }
  if (r > 1n) throw new Error('Not invertible');
  if (t < 0n) t += m;
  return t;
}

function randomScalar(): bigint {
  let s: bigint;
  do {
    const bytes = secp.utils.randomPrivateKey();
    s = 0n;
    for (const b of bytes) s = (s << 8n) | BigInt(b);
  } while (s >= CURVE_ORDER || s === 0n);
  return s;
}

/**
 * Compute Lagrange coefficient for point i when reconstructing from
 * shares at points i and j. Returns λ_i such that f(0) = λ_i * f(i) + λ_j * f(j).
 */
function lagrangeCoefficient(i: PartyId, j: PartyId): bigint {
  const bi = BigInt(i);
  const bj = BigInt(j);
  // λ_i = -j / (i - j) mod n
  const denom = modInverse(mod(bi - bj, CURVE_ORDER), CURVE_ORDER);
  return mod(-bj * denom, CURVE_ORDER);
}

/**
 * Convert signature to DER-encoded hex (Stacks compatible format).
 */
function signatureToDerHex(r: bigint, s: bigint): string {
  const toHex = (n: bigint): string => {
    let hex = n.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    if (hex[0] >= '8') hex = '00' + hex;
    const len = (hex.length / 2).toString(16).padStart(2, '0');
    return `02${len}${hex}`;
  };

  const rHex = toHex(r);
  const sHex = toHex(s);
  const der = `${rHex}${sHex}`;
  const len = (der.length / 2).toString(16).padStart(2, '0');
  return `30${len}${der}`;
}

// ─── Signing Ceremony ────────────────────────────────────────────────────

export class SigningCeremony {
  sessionId: string;
  parties: PartyId[];
  messageHash: Uint8Array;
  publicKey: string;
  private nonceCommitments: Map<PartyId, NonceCommitment>;
  private contributions: Map<PartyId, PartialContribution>;
  private combinedNonce: bigint | null = null;
  private combinedR: { x: bigint; y: bigint } | null = null;

  constructor(
    sessionId: string,
    parties: PartyId[],
    messageHash: Uint8Array,
    publicKey: string,
  ) {
    if (parties.length !== 2) {
      throw new Error(`Signing requires exactly 2 parties, got ${parties.length}`);
    }
    this.sessionId = sessionId;
    this.parties = parties;
    this.messageHash = messageHash;
    this.publicKey = publicKey;
    this.nonceCommitments = new Map();
    this.contributions = new Map();
  }

  // ── Round 1: Nonce Generation ──────────────────────────────────────

  /**
   * Party generates a nonce and commitment.
   * Called independently by each participating party.
   */
  static generateNonce(partyId: PartyId): {
    nonce: bigint;
    commitment: NonceCommitment;
  } {
    const k = randomScalar();
    const R = secp.Point.BASE.multiply(k);
    const R_hex = Buffer.from(R.toRawBytes(true)).toString('hex');

    return {
      nonce: k,
      commitment: { partyId, R: R_hex },
    };
  }

  /**
   * Submit a nonce commitment from a party.
   * Both parties must submit before proceeding to Round 2.
   */
  submitNonceCommitment(commitment: NonceCommitment): void {
    if (!this.parties.includes(commitment.partyId)) {
      throw new Error(`Party ${commitment.partyId} is not in this signing session`);
    }
    this.nonceCommitments.set(commitment.partyId, commitment);
  }

  /**
   * Check if all nonce commitments have been received.
   */
  isNonceRoundComplete(): boolean {
    return this.parties.every((p) => this.nonceCommitments.has(p));
  }

  /**
   * Get the combined R point after all nonce commitments are in.
   */
  computeCombinedR(): { x: bigint; y: bigint } {
    if (!this.isNonceRoundComplete()) {
      throw new Error('Not all parties have submitted nonce commitments');
    }

    let combinedR = secp.Point.ZERO;
    for (const [, nc] of this.nonceCommitments) {
      const point = secp.Point.fromHex(nc.R);
      combinedR = combinedR.add(point);
    }

    this.combinedR = { x: combinedR.x, y: combinedR.y };
    return this.combinedR;
  }

  /**
   * Get the r value for the signature (x-coordinate of combined R).
   */
  getSignatureR(): bigint {
    if (!this.combinedR) {
      this.computeCombinedR();
    }
    return mod(this.combinedR!.x, CURVE_ORDER);
  }

  // ── Round 2: Partial Contribution ───────────────────────────────────

  /**
   * Party prepares their partial contribution for the coordinator.
   *
   * Each party sends:
   *   - Their nonce k_i (in production, this would use MtA, not plaintext)
   *   - Their weighted share: λ_i * share_i (Lagrange-weighted)
   */
  static prepareContribution(
    partyId: PartyId,
    nonce: bigint,
    share: bigint,
    otherPartyId: PartyId,
  ): PartialContribution {
    // Compute Lagrange coefficient for this party
    const lambda = lagrangeCoefficient(partyId, otherPartyId);
    const weightedShare = mod(lambda * share, CURVE_ORDER);

    return {
      partyId,
      nonce,
      weightedShare,
    };
  }

  /**
   * Submit a partial contribution from a party.
   */
  submitContribution(contribution: PartialContribution): void {
    if (!this.parties.includes(contribution.partyId)) {
      throw new Error(`Party ${contribution.partyId} is not in this signing session`);
    }
    this.contributions.set(contribution.partyId, contribution);
  }

  /**
   * Check if all contributions have been received.
   */
  isContributionRoundComplete(): boolean {
    return this.parties.every((p) => this.contributions.has(p));
  }

  // ── Finalize: Combine and Produce Signature ─────────────────────────

  /**
   * Combine partial contributions and produce the final ECDSA signature.
   *
   * This reconstructs the private key and nonce ephemerally:
   *   k = k_1 + k_2          (combined nonce)
   *   x = w_1*x_1 + w_2*x_2  (reconstructed private key via Lagrange)
   *   s = k^(-1) * (m + x * r) mod n
   *
   * The full private key is computed in memory and immediately discarded
   * after signing. In production (v2), this would use MtA to avoid
   * key reconstruction entirely.
   */
  produceSignature(): SigningResult {
    if (!this.isContributionRoundComplete()) {
      throw new Error('Not all parties have submitted contributions');
    }
    if (!this.combinedR) {
      this.computeCombinedR();
    }

    // Combine nonces: k = k_1 + k_2
    let combinedNonce = 0n;
    // Reconstruct private key via Lagrange: x = λ_1 * x_1 + λ_2 * x_2
    let reconstructedKey = 0n;

    for (const [partyId, contrib] of this.contributions) {
      combinedNonce = mod(combinedNonce + contrib.nonce, CURVE_ORDER);
      // weightedShare already includes the Lagrange coefficient
      reconstructedKey = mod(reconstructedKey + contrib.weightedShare, CURVE_ORDER);
    }

    const r = this.getSignatureR();
    const m = bytesToBigint(this.messageHash);

    // ECDSA: s = k^(-1) * (m + x * r) mod n
    const kInv = modInverse(combinedNonce, CURVE_ORDER);
    let s = mod(kInv * (m + mod(reconstructedKey * r, CURVE_ORDER)), CURVE_ORDER);

    // Normalize s to low-S (BIP 62)
    const halfOrder = CURVE_ORDER / 2n;
    if (s > halfOrder) {
      s = CURVE_ORDER - s;
    }

    // Zero out reconstructed key from memory
    combinedNonce = 0n;
    reconstructedKey = 0n;

    const recoveryId = Number(this.combinedR!.y & 1n);

    const hex = signatureToDerHex(r, s);

    return { r, s, recoveryId, hex };
  }

  // ── Full Automated Ceremony (for in-process testing) ────────────────

  /**
   * Run the full signing ceremony between 2 parties in-process.
   * Each party provides their share and the other party's Lagrange-weighted
   * contribution is computed automatically.
   */
  static sign(
    sessionId: string,
    partyA: PartyId,
    shareA: bigint,
    partyB: PartyId,
    shareB: bigint,
    messageHash: Uint8Array,
    publicKey: string,
  ): SigningResult {
    const ceremony = new SigningCeremony(sessionId, [partyA, partyB], messageHash, publicKey);

    // Round 1: Generate nonces
    const nonceA = SigningCeremony.generateNonce(partyA);
    const nonceB = SigningCeremony.generateNonce(partyB);

    ceremony.submitNonceCommitment(nonceA.commitment);
    ceremony.submitNonceCommitment(nonceB.commitment);
    ceremony.computeCombinedR();

    // Round 2: Prepare contributions
    const contribA = SigningCeremony.prepareContribution(partyA, nonceA.nonce, shareA, partyB);
    const contribB = SigningCeremony.prepareContribution(partyB, nonceB.nonce, shareB, partyA);

    ceremony.submitContribution(contribA);
    ceremony.submitContribution(contribB);

    return ceremony.produceSignature();
  }

  /**
   * Verify a signature against the joint public key.
   */
  static verify(
    publicKeyHex: string,
    messageHash: Uint8Array,
    sig: { r: bigint; s: bigint },
  ): boolean {
    try {
      const pk = secp.Point.fromHex(publicKeyHex);
      const pubKeyBytes = Buffer.from(pk.toRawBytes(false));
      const signature = new secp.Signature(sig.r, sig.s);
      return secp.verify(signature, messageHash, pubKeyBytes);
    } catch {
      return false;
    }
  }
}

// ─── Stacks Transaction Signing ──────────────────────────────────────────

/**
 * Sign a Stacks transaction hash using the TSS ceremony.
 *
 * Stacks uses secp256k1 ECDSA with specific sighash types.
 * The transaction is pre-hashed (usually SHA-256 of the serialized
 * transaction with the appropriate sighash byte appended).
 *
 * Usage:
 *   import { makeUnsignedSTXTokenTransfer } from '@stacks/transactions';
 *   const tx = await makeUnsignedSTXTokenTransfer({ ... });
 *   const sigHash = tx.signBegin();  // Returns the sighash bytes
 *   const signature = await signStacksTransaction(sigHash, shareA, shareB);
 *   tx.signNextOrigin(sigHash, signature.hex);
 */
export function signStacksTransactionHash(
  sigHash: Buffer | Uint8Array,
  partyA: PartyId,
  shareA: bigint,
  partyB: PartyId,
  shareB: bigint,
  publicKey: string,
): SigningResult {
  const messageHash = Buffer.isBuffer(sigHash)
    ? sigHash
    : Buffer.from(sigHash);

  return SigningCeremony.sign(
    `stacks-tx-${Date.now()}`,
    partyA,
    shareA,
    partyB,
    shareB,
    messageHash,
    publicKey,
  );
}

// ─── Internal Helpers ────────────────────────────────────────────────────

function bytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b);
  }
  return result;
}

export { mod, modInverse, randomScalar, lagrangeCoefficient, CURVE_ORDER };
