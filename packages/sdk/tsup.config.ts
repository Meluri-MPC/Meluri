import { defineConfig, Options } from 'tsup';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-native',
  '@react-native-async-storage/async-storage',
  'crypto',
];

const baseConfig: Options = {
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    'wallets/index': 'src/wallets/index.ts',
    'ui/index': 'src/ui/index.ts',
  },
  external,
  sourcemap: true,
  dts: true,
  clean: true,
  target: 'es2022',
  platform: 'neutral',
  treeshake: true,
  splitting: false,
};

export default defineConfig([
  {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist',
    outExtension: () => ({ js: '.mjs', dts: '.d.mts' }),
    esbuildOptions(opts) {
      opts.keepNames = true;
    },
  },
  {
    ...baseConfig,
    format: 'cjs',
    outDir: 'dist',
    outExtension: () => ({ js: '.cjs', dts: '.d.cts' }),
    esbuildOptions(opts) {
      opts.keepNames = true;
    },
  },
]);
