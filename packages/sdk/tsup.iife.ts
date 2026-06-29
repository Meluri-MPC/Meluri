import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'cdn/velumx': 'src/index.ts' },
  outDir: 'dist',
  format: 'iife',
  globalName: 'VelumX',
  target: 'es2020',
  platform: 'browser',
  minify: 'terser',
  sourcemap: false,
  outExtension: () => ({ js: '.iife.js' }),
  dts: false,
  clean: false,
  esbuildOptions(opts) {
    opts.keepNames = false;
  },
  noExternal: [/.*/],
  external: ['crypto'],
  banner: {
    js: `/* VelumX MPC SDK — CDN IIFE bundle. Requires a global "crypto" module (Node.js) or polyfill. */`,
  },
});
