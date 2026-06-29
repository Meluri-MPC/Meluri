import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { 'native/index': 'src/native/index.ts' },
    outDir: 'dist',
    format: 'esm',
    outExtension: () => ({ js: '.mjs', dts: '.d.mts' }),
    external: [
      'react',
      'react-native',
      'react/jsx-runtime',
      '@react-native-async-storage/async-storage',
      'expo-web-browser',
      'react-native-inappbrowser',
      'expo-crypto',
      'react-native-quick-crypto',
      'crypto',
      '@noble/secp256k1',
    ],
    sourcemap: true,
    dts: true,
    clean: false,
    target: 'es2022',
    platform: 'neutral',
    treeshake: true,
    splitting: false,
    esbuildOptions(opts) {
      opts.keepNames = true;
    },
  },
  {
    entry: { 'native/index': 'src/native/index.ts' },
    outDir: 'dist',
    format: 'cjs',
    outExtension: () => ({ js: '.cjs', dts: '.d.cts' }),
    external: [
      'react',
      'react-native',
      'react/jsx-runtime',
      '@react-native-async-storage/async-storage',
      'expo-web-browser',
      'react-native-inappbrowser',
      'expo-crypto',
      'react-native-quick-crypto',
      'crypto',
      '@noble/secp256k1',
    ],
    sourcemap: true,
    dts: true,
    clean: false,
    target: 'es2022',
    platform: 'neutral',
    treeshake: true,
    splitting: false,
    esbuildOptions(opts) {
      opts.keepNames = true;
    },
  },
]);
