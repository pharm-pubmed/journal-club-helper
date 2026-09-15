import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['.output/**', '.wxt/**', 'coverage/**', 'node_modules/**', 'dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        chrome: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        queueMicrotask: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        Document: 'readonly',
        Node: 'readonly',
        TextEncoder: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // Spec §5/§9: API keys and appraisals must never reach chrome.storage.sync.
          selector:
            "MemberExpression[object.object.name='chrome'][object.property.name='storage'][property.name='sync']",
          message:
            'chrome.storage.sync is forbidden (SPEC.ja.md §4.6): everything stays in chrome.storage.local.',
        },
      ],
    },
  },
  {
    files: ['src/lib/**/*.ts'],
    rules: {
      // src/lib must stay pure and unit-testable in a node environment.
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'src/lib must not touch the DOM (exception: pubmed-dom.ts).' },
        { name: 'window', message: 'src/lib must not touch the DOM.' },
      ],
    },
  },
  {
    files: ['src/lib/pubmed-dom.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.mjs', '*.config.ts', '*.config.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-globals': 'off',
    },
  },
  prettier,
);
