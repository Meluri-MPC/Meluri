/**
 * BIP39-compatible 12-word mnemonic generation and validation.
 *
 * Uses the standard BIP39 English wordlist (2048 words).
 *
 * Process:
 *   1. Generate 128 bits of entropy (for 12 words) or 256 bits (for 24)
 *   2. Compute SHA256 of entropy → first (entropyLen/32) bits = checksum
 *   3. Concatenate entropy + checksum
 *   4. Split into 11-bit groups → index into wordlist
 */

import { sha256 } from '@noble/hashes/sha256';
import type { MnemonicPhrase, RecoveryVerification } from './types';

// BIP39 English wordlist (abbreviated - first 2048 words are used)
// Full list: https://github.com/bitcoin/bips/blob/master/bip-0039/english.txt
// For production, load from a file. Here we embed a shortened but valid subset
// that includes all words needed for entropy-to-mnemonic mapping.
import { BIP39_WORDS } from './wordlist';

// ─── Entropy Generation ──────────────────────────────────────────────────

/**
 * Generate cryptographically secure random entropy.
 */
export function generateEntropy(bits: 128 | 256 = 128): Uint8Array {
  const bytes = bits / 8;
  const entropy = new Uint8Array(bytes);

  // Use Node.js crypto for secure random
  const { randomFillSync } = require('crypto');
  randomFillSync(entropy);

  return entropy;
}

// ─── Mnemonic Generation ─────────────────────────────────────────────────

/**
 * Generate a BIP39 mnemonic phrase from entropy.
 *
 * @param entropy - 16 bytes (128 bits) for 12 words, or 32 bytes (256 bits) for 24 words
 * @returns MnemonicPhrase with words, entropy, and hex-encoded entropy
 */
export function generateMnemonic(entropy?: Uint8Array): MnemonicPhrase {
  const ent = entropy ?? generateEntropy(128);
  if (ent.length !== 16 && ent.length !== 32) {
    throw new Error(`Entropy must be 16 or 32 bytes, got ${ent.length}`);
  }

  // Compute checksum: SHA256(entropy), first (entropy.length * 8 / 32) bits
  const hash = sha256(ent);
  const checksumBits = ent.length * 8 / 32; // 4 for 128-bit, 8 for 256-bit
  const checksumByte = hash[0];

  // Combine entropy + checksum into a bit buffer
  const totalBits = ent.length * 8 + checksumBits;
  const words: string[] = [];

  let bitBuffer = 0;
  let bitCount = 0;

  // Feed entropy bits
  for (const byte of ent) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;

    while (bitCount >= 11) {
      const index = (bitBuffer >> (bitCount - 11)) & 0x7ff;
      words.push(BIP39_WORDS[index]);
      bitCount -= 11;
    }
  }

  // Feed checksum bits
  bitBuffer = (bitBuffer << checksumBits) | (checksumByte >> (8 - checksumBits));
  bitCount += checksumBits;

  while (bitCount >= 11 && words.length < (ent.length * 8 + checksumBits) / 11) {
    const index = (bitBuffer >> (bitCount - 11)) & 0x7ff;
    words.push(BIP39_WORDS[index]);
    bitCount -= 11;
  }

  return {
    words,
    entropy: ent,
    entropyHex: Buffer.from(ent).toString('hex'),
  };
}

// ─── Mnemonic Validation ──────────────────────────────────────────────────

/**
 * Validate a mnemonic phrase using the BIP39 checksum.
 */
export function validateMnemonic(words: string[]): boolean {
  if (words.length !== 12 && words.length !== 24) return false;

  // Convert words back to entropy + checksum bits
  const bits: number[] = [];
  for (const word of words) {
    const index = BIP39_WORDS.indexOf(word);
    if (index === -1) return false;
    // Extract 11 bits from index
    for (let i = 10; i >= 0; i--) {
      bits.push((index >> i) & 1);
    }
  }

  // Entropy length: 12 words = 128 bits, 24 words = 256 bits
  const entropyLen = words.length === 12 ? 128 : 256;
  const checksumLen = entropyLen / 32;
  const totalBits = entropyLen + checksumLen;

  if (bits.length < totalBits) return false;

  // Reconstruct entropy bytes
  const entropy = new Uint8Array(entropyLen / 8);
  for (let i = 0; i < entropyLen; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = 7 - (i % 8);
    if (bits[i]) {
      entropy[byteIndex] |= (1 << bitIndex);
    }
  }

  // Recompute checksum
  const hash = sha256(entropy);
  const expectedChecksum = hash[0] >> (8 - checksumLen);

  // Extract actual checksum from bits
  let actualChecksum = 0;
  for (let i = 0; i < checksumLen; i++) {
    if (bits[entropyLen + i]) {
      actualChecksum |= (1 << (checksumLen - 1 - i));
    }
  }

  return actualChecksum === expectedChecksum;
}

/**
 * Check if individual words are in the BIP39 wordlist.
 */
export function isValidWord(word: string): boolean {
  return BIP39_WORDS.includes(word.toLowerCase());
}

/**
 * Get word suggestions for partial input (autocomplete).
 */
export function suggestWords(prefix: string): string[] {
  const lower = prefix.toLowerCase();
  return BIP39_WORDS.filter((w) => w.startsWith(lower)).slice(0, 5);
}

// ─── Verification ─────────────────────────────────────────────────────────

/**
 * Generate a recovery verification challenge.
 *
 * After the user sees their mnemonic, we ask them to re-enter
 * 3 random words to confirm they've saved it.
 */
export function generateVerificationChallenge(
  wordCount: number = 12,
): RecoveryVerification {
  const indices = new Set<number>();
  while (indices.size < 3) {
    indices.add(Math.floor(Math.random() * wordCount));
  }

  const sortedIndices = Array.from(indices).sort((a, b) => a - b) as [
    number,
    number,
    number,
  ];

  return {
    requestedIndices: sortedIndices,
  };
}

/**
 * Verify that the user re-entered the correct words.
 */
export function verifyChallengeResponse(
  original: MnemonicPhrase,
  challenge: RecoveryVerification,
  responses: [string, string, string],
): boolean {
  for (let i = 0; i < 3; i++) {
    const expectedWord = original.words[challenge.requestedIndices[i]];
    if (responses[i].toLowerCase() !== expectedWord.toLowerCase()) {
      return false;
    }
  }
  return true;
}

// ─── Mnemonic to Seed ─────────────────────────────────────────────────────

/**
 * Convert mnemonic phrase back to entropy.
 * (The actual seed derivation with PBKDF2 is in key-derivation.ts)
 */
export function mnemonicToEntropy(words: string[]): Uint8Array {
  if (!validateMnemonic(words)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const entropyLen = words.length === 12 ? 16 : 32;
  const entropy = new Uint8Array(entropyLen);

  // Convert words to bit stream
  const bits: number[] = [];
  for (const word of words) {
    const index = BIP39_WORDS.indexOf(word);
    for (let i = 10; i >= 0; i--) {
      bits.push((index >> i) & 1);
    }
  }

  // Extract entropy bits
  for (let i = 0; i < entropyLen * 8; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = 7 - (i % 8);
    if (bits[i]) {
      entropy[byteIndex] |= (1 << bitIndex);
    }
  }

  return entropy;
}
