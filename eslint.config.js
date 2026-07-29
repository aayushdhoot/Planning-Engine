import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const NODE_GLOBALS = { console: 'readonly', process: 'readonly', URL: 'readonly', Blob: 'readonly', document: 'readonly', window: 'readonly', structuredClone: 'readonly' };

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'sample-output'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['scripts/**/*.{mjs,ts}', 'src/**/*.{ts,tsx}', 'tests/**/*.ts'], languageOptions: { globals: NODE_GLOBALS } },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      // project rules: the engine must stay deterministic and norms must stay data
      'no-restricted-globals': ['error', { name: 'localStorage', message: 'Browser storage is not permitted.' }, { name: 'sessionStorage', message: 'Browser storage is not permitted.' }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Non-deterministic: violates T1-DETERMINISM.' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': ['error', { allow: ['log', 'warn', 'error'] }],
    },
  },
  {
    // Sole exception to the storage ban. Connection settings only (the Drive OAuth client ID),
    // never anything the planner reads — see the file header for the reasoning.
    files: ['src/services/settings-store.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
);
