import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['coverage/', 'dist/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
    }
  },
  {
    files: ['vite.config.ts'],
    languageOptions: {
      globals: globals.node
    }
  }
);
