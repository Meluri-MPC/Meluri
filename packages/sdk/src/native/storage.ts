import { NativeStorageInterface } from './types';

export class NativeStorage implements NativeStorageInterface {
  private asyncImpl: any = null;

  constructor() {
    this.loadAsyncStorage();
  }

  private async loadAsyncStorage(): Promise<any> {
    if (this.asyncImpl) return this.asyncImpl;
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      this.asyncImpl = AsyncStorage;
      return AsyncStorage;
    } catch {
      throw new Error(
        '@react-native-async-storage/async-storage is required for React Native. ' +
        'Install it: npx expo install @react-native-async-storage/async-storage'
      );
    }
  }

  async getItem(key: string): Promise<string | null> {
    const storage = await this.loadAsyncStorage();
    return storage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    const storage = await this.loadAsyncStorage();
    await storage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    const storage = await this.loadAsyncStorage();
    await storage.removeItem(key);
  }
}
