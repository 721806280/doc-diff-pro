import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH?.trim() || '/doc-diff-pro/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-utils/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test-utils/**', 'src/types/**', 'src/main.tsx', 'src/vite-env.d.ts'],
      // Floors sit just under the measured baseline: they guard against
      // regression rather than mandating an increase.
      thresholds: {
        statements: 85,
        branches: 76,
        functions: 82,
        lines: 89
      }
    }
  }
});
