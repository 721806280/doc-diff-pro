import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The comparison panes render HTML that came out of a user-supplied .docx, so
 * DOMPurify does the real work here — this policy is the second line of
 * defense for the day a bypass lands. It ships as a meta tag rather than a
 * response header because the deploy target is GitHub Pages, which serves
 * static files and nothing else.
 *
 * `'unsafe-inline'` for styles is unavoidable: index.html carries an inline
 * <style> block and React writes the theme through a style attribute.
 * `frame-ancestors` and `report-uri` are left out because a meta-delivered
 * policy ignores both.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'"
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'doc-diff-pro:content-security-policy',
    // Build only: in dev, @vitejs/plugin-react injects the react-refresh
    // preamble as an inline module script that `script-src 'self'` would block.
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend'
      }
    ]
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH?.trim() || '/doc-diff-pro/',
  plugins: [react(), contentSecurityPolicy()],
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
        statements: 95,
        branches: 86,
        functions: 97,
        lines: 98
      }
    }
  }
});
