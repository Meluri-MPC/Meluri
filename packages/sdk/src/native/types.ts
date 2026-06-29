export interface NativeAuthProvider {
  login(): Promise<{ userId: string; sessionToken: string }>;
  logout(): Promise<void>;
  getSession(): Promise<{ userId: string; sessionToken: string } | null>;
}

export interface NativeConfig {
  apiKey: string;
  auth: NativeAuthProvider;
  network?: 'mainnet' | 'testnet';
  backendUrl?: string;
  storage?: NativeStorageInterface;
  crypto?: NativeCryptoInterface;
}

export interface NativeStorageInterface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface NativeCryptoInterface {
  randomBytes(size: number): Uint8Array;
  sha256(data: Uint8Array): Uint8Array;
}
