// Browser-compatible crypto + Buffer polyfill  
// Provides named exports matching Node.js crypto module
const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class Buffer extends Uint8Array {
  static from(data: string | Uint8Array | number[], encoding?: string): Buffer {
    if (typeof data === 'string') {
      if (encoding === 'hex') return new Buffer(hexToBytes(data));
      return new Buffer(encoder.encode(data));
    }
    return new Buffer(data);
  }

  static concat(buffers: Uint8Array[]): Buffer {
    const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
    const result = new Buffer(totalLength);
    let offset = 0;
    for (const buf of buffers) { result.set(buf, offset); offset += buf.length; }
    return result;
  }

  toString(encoding?: string): string {
    if (encoding === 'hex') return bytesToHex(this);
    return new TextDecoder().decode(this);
  }
}

// Synchronous SHA-256
function sha256Sync(data: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const msg = new Uint8Array(data.length + 72);
  msg.set(data);
  const bitLen = BigInt(data.length) * 8n;
  msg[data.length] = 0x80;
  const pos = ((data.length + 8) & ~63) + 56;
  const view = new DataView(msg.buffer);
  view.setBigUint64(pos, bitLen, false);

  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

  for (let i = 0; i < msg.length; i += 64) {
    const W = new Uint32Array(64);
    for (let t = 0; t < 16; t++)
      W[t] = (msg[i+t*4]<<24)|(msg[i+t*4+1]<<16)|(msg[i+t*4+2]<<8)|msg[i+t*4+3];
    for (let t = 16; t < 64; t++) {
      const s0 = (rightRotate(W[t-15],7)^rightRotate(W[t-15],18)^(W[t-15]>>>3));
      const s1 = (rightRotate(W[t-2],17)^rightRotate(W[t-2],19)^(W[t-2]>>>10));
      W[t] = (W[t-16]+s0+W[t-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rightRotate(e,6)^rightRotate(e,11)^rightRotate(e,25);
      const ch = (e&f)^(~e&g);
      const T1 = (h+S1+ch+K[t]+W[t])>>>0;
      const S0 = rightRotate(a,2)^rightRotate(a,13)^rightRotate(a,22);
      const maj = (a&b)^(a&c)^(b&c);
      const T2 = (S0+maj)>>>0;
      h=g; g=f; f=e; e=(d+T1)>>>0; d=c; c=b; b=a; a=(T1+T2)>>>0;
    }
    H[0] = (H[0]+a)>>>0; H[1] = (H[1]+b)>>>0; H[2] = (H[2]+c)>>>0; H[3] = (H[3]+d)>>>0;
    H[4] = (H[4]+e)>>>0; H[5] = (H[5]+f)>>>0; H[6] = (H[6]+g)>>>0; H[7] = (H[7]+h)>>>0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i*4] = (H[i]>>>24)&0xff; out[i*4+1] = (H[i]>>>16)&0xff;
    out[i*4+2] = (H[i]>>>8)&0xff; out[i*4+3] = H[i]&0xff;
  }
  return out;
}

function rightRotate(x: number, n: number): number { return (x>>>n)|(x<<(32-n)); }

class Hash {
  private data: Uint8Array = new Uint8Array(0);
  update(d: Uint8Array | string): this {
    if (typeof d === 'string') this.data = new Uint8Array(encoder.encode(d));
    else this.data = d;
    return this;
  }
  digest(encoding?: string): string | Buffer {
    const hash = sha256Sync(this.data);
    if (encoding === 'hex') return bytesToHex(hash);
    return new Buffer(hash);
  }
}

export function randomBytes(size: number): Buffer {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return new Buffer(bytes);
}

export function createHash(alg: string): Hash {
  if (alg !== 'sha256') throw new Error(`Unsupported hash: ${alg}`);
  return new Hash();
}

// Stubs for Turnkey API key stamper (server-only, not used in browser)
export function createPrivateKey() { throw new Error('createPrivateKey not available in browser'); }
export function createSign() { throw new Error('createSign not available in browser'); }
