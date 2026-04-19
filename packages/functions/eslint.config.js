import js from '@eslint/js';
import globals from 'globals';

export default [
  // WHY here (not .eslintignore): flat-config ESLint 9 dropped .eslintignore; paths must be
  // declared via a config block with only `ignores`. Covers esbuild output (bin/, dist/)
  // across all sibling Lambdas (api/, renderer/, image-resizer/).
  {
    ignores: [
      '**/bin/**',
      '**/dist/**',
      '**/node_modules/**',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'arrow-body-style': ['error', 'as-needed'],
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Extend coverage to sibling `packages/shared/` so `yarn lint` (run from packages/functions)
  // walks up into the shared library too. WHY: shared has no package.json of its own,
  // so it piggy-backs on functions' ESLint config.
  {
    files: ['../shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
