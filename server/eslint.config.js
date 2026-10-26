const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  { ignores: ['node_modules/', 'uploads/', 'prisma/migrations/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^next$' }] },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  prettier,
];
