import { NativeCryptoInterface } from './types';

export class NativeCrypto implements NativeCryptoInterface {
  private impl: any = null;
  private useExpo: boolean = false;

  constructor() {
    this.detectCrypto();
  }

  private detectCrypto(): void {
    try {
      this.impl = require('react-native-quick-crypto');
      this.useExpo = false;
      return;
    } catch {}

    try {
      this.impl = require('expo-crypto');
      this.useExpo = true;
      return;
    } catch {}

    try {
      this.impl = require('crypto');
      this.useExpo = false;
      return;
    } catch {}

    throw new Error(
      'No crypto implementation found. Install one of:\n' +
      '  - npx expo install expo-crypto\n' +
      '  - npm install react-native-quick-crypto'
    );
  }

  getRandomValues(length: number): Uint8Array {
    return this.randomBytes(length);
  }

  randomBytes(size: number): Uint8Array {
    if (this.useExpo) {
      const bytes = this.impl.getRandomBytes(size);
      return new Uint8Array(bytes);
    }

    if (typeof this.impl.randomBytes === 'function') {
      const buf = this.impl.randomBytes(size);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }

    if (typeof this.impl.getRandomValues === 'function') {
      const arr = new Uint8Array(size);
      this.impl.getRandomValues(arr);
      return arr;
    }

    const arr = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }

  sha256(data: Uint8Array): Uint8Array {
    if (this.useExpo) {
      const hex = this.impl.digestStringAsync(
        this.impl.CryptoDigestAlgorithm.SHA256,
        String.fromCharCode(...data)
      );
      // expo-crypto digestStringAsync is async, but sha256 is sync by interface
      // For sync usage, fall through to JS fallback
      throw new Error(
        'expo-crypto operations are async. Use sha256Async for React Native.'
      );
    }

    if (typeof this.impl.createHash === 'function') {
      const hash = this.impl.createHash('sha256').update(Buffer.from(data)).digest();
      return new Uint8Array(hash.buffer, hash.byteOffset, hash.byteLength);
    }

    throw new Error('No synchronous SHA-256 implementation available.');
  }

  async sha256Async(data: Uint8Array): Promise<Uint8Array> {
    if (this.useExpo) {
      const hex = await this.impl.digestStringAsync(
        this.impl.CryptoDigestAlgorithm.SHA256,
        String.fromCharCode(...data)
      );
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      return bytes;
    }
    return this.sha256(data);
  }
}
