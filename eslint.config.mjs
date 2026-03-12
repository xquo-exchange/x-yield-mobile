import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        __DEV__: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        Promise: 'readonly',
        BigInt: 'readonly',
        URL: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        Date: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Number: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        Error: 'readonly',
        Array: 'readonly',
        Object: 'readonly',
        String: 'readonly',
        Boolean: 'readonly',
        RegExp: 'readonly',
        Intl: 'readonly',
        alert: 'readonly',
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        global: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...prettier.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      'ios/',
      'android/',
      '.expo/',
      'web-build/',
      'scripts/',
    ],
  },
];
