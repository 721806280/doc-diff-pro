import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['coverage/', 'dist/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    // Config files authored in plain JS have no type information to draw on.
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser
    },
    plugins: {
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-noninteractive-tabindex': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'no-irregular-whitespace': 'off',
      'no-misleading-character-class': 'off'
    },
    settings: {
      react: { version: 'detect' }
    }
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test-utils/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.vitest
    },
    rules: {
      // Test doubles routinely pass partial shapes and detached methods, and
      // vitest callbacks are often declared `async` without awaiting. Holding
      // fixtures to the production type-safety bar adds noise, not safety.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off'
    }
  },
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts', 'vite.config.ts'],
    languageOptions: {
      globals: globals.node
    }
  }
);
