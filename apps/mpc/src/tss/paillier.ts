/**
 * Paillier Homomorphic Encryption
 *
 * Implements the Paillier cryptosystem, required by the GG20 threshold ECDSA
 * protocol for secure share exchange without revealing shares to other parties.
 *
 * Key features:
 * - Additively homomorphic: Enc(a) * Enc(b) mod n^2 = Enc(a + b mod n)
 * - Randomizable: Enc(a) * r^n mod n^2 = Enc(a) for fresh randomness
 * - Used in GG20 to encrypt shares during DKG and signing rounds
 *
 * Security: Key size must be at least 2048 bits for 128-bit security level
 * when paired with secp256k1 (256-bit curve).
 */

import { randomBytes } from 'crypto';

export interface PaillierPublicKey {
  n: bigint;
  g: bigint;
  n2: bigint; // n^2, cached for performance
}

export interface PaillierSecretKey {
  lambda: bigint;
  mu: bigint;
  p?: bigint;
  q?: bigint;
}

export interface PaillierKeyPair {
  publicKey: PaillierPublicKey;
  secretKey: PaillierSecretKey;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

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

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function lcm(a: bigint, b: bigint): bigint {
  return (a / gcd(a, b)) * b;
}

function randomBigint(bits: number): bigint {
  const byteLen = Math.ceil(bits / 8);
  const buf = randomBytes(byteLen);
  let result = 0n;
  for (const b of buf) result = (result << 8n) | BigInt(b);
  // Mask to desired bit length
  const mask = (1n << BigInt(bits)) - 1n;
  return result & mask;
}

function randomBigintRange(max: bigint): bigint {
  const bits = max.toString(2).length;
  for (let i = 0; i < 100; i++) {
    const r = randomBigint(bits);
    if (r < max && r > 1n) return r;
  }
  // Fallback
  return mod(randomBigint(bits), max - 2n) + 2n;
}

// Miller-Rabin primality test
function isProbablePrime(n: bigint, k: number = 10): boolean {
  if (n < 2n) return false;
  if (n === 2n || n === 3n) return true;
  if (n % 2n === 0n) return false;

  // Write n-1 as 2^r * d
  let r = 0n;
  let d = n - 1n;
  while (d % 2n === 0n) {
    d /= 2n;
    r += 1n;
  }

  for (let i = 0; i < k; i++) {
    const a = randomBigintRange(n - 3n);
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let composite = true;
    for (let j = 0n; j < r - 1n; j++) {
      x = modPow(x, 2n, n);
      if (x === n - 1n) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

function generatePrime(bits: number): bigint {
  for (let i = 0; i < 10000; i++) {
    const candidate = randomBigint(bits) | 1n | (1n << BigInt(bits - 1));
    // Ensure candidate >= 2^(bits-1) (proper bit length)
    if (isProbablePrime(candidate, 10)) return candidate;
  }
  throw new Error(`Failed to generate ${bits}-bit prime after 10000 attempts`);
}

function generateSafePrimePair(bits: number): [bigint, bigint] {
  for (let i = 0; i < 1000; i++) {
    const p = generatePrime(bits);
    const q = generatePrime(bits);
    // Ensure p*q has gcd with (p-1)(q-1) = 1 (Paillier requirement)
    if (gcd(p * q, (p - 1n) * (q - 1n)) === 1n && p !== q) {
      return [p, q];
    }
  }
  throw new Error('Failed to generate valid Paillier prime pair');
}

export function generatePaillierKeypair(bits: number = 512): PaillierKeyPair {
  const halfBits = Math.floor(bits / 2);
  const [p, q] = generateSafePrimePair(halfBits);

  const n = p * q;
  const n2 = n * n;
  const lambda = lcm(p - 1n, q - 1n);

  // g = n + 1 (convenient generator, g = n+1 works for Paillier)
  const g = n + 1n;

  // mu = L(g^lambda mod n^2)^(-1) mod n
  // For g = n+1: L(g^lambda mod n^2) = lambda mod n
  const L = mod(lambda, n);
  const mu = modInverse(L, n);

  return {
    publicKey: { n, g, n2 },
    secretKey: { lambda, mu, p, q },
  };
}

export function encrypt(pk: PaillierPublicKey, plaintext: bigint): bigint {
  // c = g^m * r^n mod n^2
  const r = randomBigintRange(pk.n);
  const gm = modPow(pk.g, plaintext, pk.n2);
  const rn = modPow(r, pk.n, pk.n2);
  return mod(gm * rn, pk.n2);
}

export function decrypt(sk: PaillierSecretKey, pk: PaillierPublicKey, ciphertext: bigint): bigint {
  // m = L(c^lambda mod n^2) * mu mod n
  const cLambda = modPow(ciphertext, sk.lambda, pk.n2);
  // L(x) = (x - 1) / n
  const L = (cLambda - 1n) / pk.n;
  return mod(L * sk.mu, pk.n);
}

export function add(pk: PaillierPublicKey, c1: bigint, c2: bigint): bigint {
  return mod(c1 * c2, pk.n2);
}

export function scalarMul(pk: PaillierPublicKey, ciphertext: bigint, scalar: bigint): bigint {
  return modPow(ciphertext, scalar, pk.n2);
}

export function serializePublicKey(pk: PaillierPublicKey): string {
  return JSON.stringify({ n: pk.n.toString(16) });
}

export function deserializePublicKey(data: string): PaillierPublicKey {
  const { n } = JSON.parse(data);
  const bn = BigInt('0x' + n);
  return { n: bn, g: bn + 1n, n2: bn * bn };
}
