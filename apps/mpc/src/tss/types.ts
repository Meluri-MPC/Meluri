import type { PaillierPublicKey, PaillierSecretKey } from './paillier';

export type PartyId = number;

export interface HexEncoded {
  readonly _brand: unique symbol;
}

export interface CommitmentSet {
  /** Feldman VSS commitments as hex-encoded compressed points: C_k = g^{a_k} */
  commitments: string[];
  /** NIZK Schnorr proof for knowledge of a_0 (the secret) */
  dlogProof: SchnorrProof;
}

export interface SchnorrProof {
  /** Commitment point: U = u*G (hex-encoded compressed point) */
  U: string;
  /** Response: s = u + c*a_0 (mod n) */
  s: bigint;
}

export interface Round1Message {
  from: PartyId;
  /** Feldman VSS commitments for party's polynomial */
  commitmentSet: CommitmentSet;
  /** Paillier public key for this party */
  paillierPk: PaillierPublicKey;
  /** NIZK proof that Paillier key is well-formed */
  paillierProof: PaillierProof;
}

export interface Round2Message {
  from: PartyId;
  to: PartyId;
  /** Paillier-encrypted share: Enc_{N_j}(f_i(j)) */
  encryptedShare: bigint;
  /** ZK proof that encrypted share matches commitments */
  shareProof: ShareProof;
}

export interface Round3Message {
  from: PartyId;
  /** Confirmation that all shares were verified */
  verified: boolean;
  /** Public key share contribution */
  publicKeyShare: Uint8Array;
}

export interface PartyState {
  partyId: PartyId;
  /** The secret polynomial f_i(x) = a_{i,0} + a_{i,1}*x (mod n) */
  polynomial: bigint[];
  /** Paillier secret key */
  paillierSk: PaillierSecretKey;
  /** Paillier public key */
  paillierPk: PaillierPublicKey;
  /** Feldman VSS commitments */
  commitmentSet: CommitmentSet;
  /** All received Round 1 messages */
  round1Messages: Map<PartyId, Round1Message>;
  /** All received Round 2 messages addressed to this party */
  round2Messages: Map<PartyId, Round2Message>;
  /** All received Round 3 messages */
  round3Messages: Map<PartyId, Round3Message>;
  /** Decrypted shares from each party */
  receivedShares: Map<PartyId, bigint>;
  /** This party's combined secret key share: x_i = Σ_j f_j(i) (mod n) */
  secretShare: bigint | null;
  /** The joint public key: Q = Σ_j C_{j,0} = g^{Σ_j a_{j,0}} */
  publicKey: Uint8Array | null;
}

export interface PaillierProof {
  /** Challenge from Fiat-Shamir transform */
  challenge: bigint;
  /** Response value */
  response: bigint[];
}

export interface ShareProof {
  /** Challenge from Fiat-Shamir */
  challenge: bigint;
  /** Response showing encrypted value matches commitment */
  response: bigint;
}

export type DkgRound = 1 | 2 | 3;

export interface DkgSession {
  sessionId: string;
  parties: PartyId[];
  threshold: number;
  round: DkgRound;
  states: Map<PartyId, PartyState>;
}

export interface DkgResult {
  /** The joint public key (secp256k1 compressed point) */
  publicKey: Uint8Array;
  /** Secret key share for each party (needs to be encrypted before storage) */
  shares: Map<PartyId, bigint>;
}
