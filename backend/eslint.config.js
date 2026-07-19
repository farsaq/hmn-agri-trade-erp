import js from '@eslint/js';
import globals from 'globals';
export default [
  {
    ignores: [
      'node_modules/**',
      'logs/**',
      'uploads/**',
      'backups/**',
      'coverage/**',
      'src-backup/**',
      'src-backup-*/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-async-promise-executor': 'off',
    },
  },
  { files: ['tests/**/*.js'], languageOptions: { globals: { ...globals.node } } },
];
