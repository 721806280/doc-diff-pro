import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const buildId = Date.now().toString(36);

function offlineAssetManifest(): Plugin {
  return {
    name: 'offline-asset-manifest',
    generateBundle(_options, bundle) {
      this.emitFile({
        type: 'asset',
        fileName: 'asset-manifest.json',
        source: JSON.stringify(Object.keys(bundle).sort())
      });
    }
  };
}

export default defineConfig({
  base: '/doc-diff-pro/',
  define: {
    __BUILD_ID__: JSON.stringify(buildId)
  },
  plugins: [vue(), offlineAssetManifest()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
