import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

// Read public/config.json (written by `yarn frontend:config`) so the dev server can
// proxy `/api/*` to the prod host. Same-origin from the browser's POV = no CORS
// preflight failures. Falls back to no proxy if config.json hasn't been materialized
// yet (e.g. first run of `yarn dev` without chaining frontend:config).
const configPath = path.resolve(__dirname, './public/config.json');
const apiTarget = fs.existsSync(configPath)
  ? `https://${JSON.parse(fs.readFileSync(configPath, 'utf8')).publicHost}`
  : null;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@':          path.resolve(__dirname, 'src'),
      '@shared':    path.resolve(__dirname, '../shared'),
      '@templates': path.resolve(__dirname, '../templates'),
    },
  },
  // Fixed port so the Cognito app client's localhost callback URL stays in sync.
  // strictPort: fail rather than auto-pick another port if 5178 is busy — that would
  // cause Cognito redirect to reject the mismatched callback silently.
  server: {
    port: 5178,
    host: true,
    strictPort: true,
    ...(apiTarget && {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, secure: true },
      },
    }),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        // Split heavy vendor deps into their own chunks so the main bundle stays
        // under the 500 kB warning threshold and the browser can cache each
        // vendor independently across app deploys (app code changes far more
        // often than aws-amplify or react). Rolldown (Vite 8) requires
        // manualChunks as a function, not an object — match module paths.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (id.includes('aws-amplify') || id.includes('@aws-amplify') || id.includes('@aws-crypto') || id.includes('@aws-sdk') || id.includes('@smithy')) return 'amplify';
          if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/') || id.includes('scheduler')) return 'react';
          if (id.includes('radix-ui') || id.includes('@radix-ui')) return 'radix';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-utils.js'],
  },
});
