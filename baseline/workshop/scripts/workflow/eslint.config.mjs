// Standalone Node helpers: do not load Next.js application plugins.
export default [
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { process: 'readonly', fetch: 'readonly', AbortSignal: 'readonly', URL: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-async-promise-executor': 'error',
      'no-promise-executor-return': 'error',
      'no-unsafe-finally': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'constructor-super': 'error',
      'valid-typeof': 'error',
    },
  },
]
