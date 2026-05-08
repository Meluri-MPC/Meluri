import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@meluri/mpc': path.resolve(__dirname, '../../packages/sdk/src'),
      'crypto': path.resolve(__dirname, 'src/polyfills/crypto.ts'),
      'buffer': path.resolve(__dirname, 'src/polyfills/buffer.ts'),
    },
  },
  define: {
    global: 'globalThis',
  },
  server: { port: 5173 },
});
