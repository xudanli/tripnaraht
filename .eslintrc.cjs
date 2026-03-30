/* eslint-env node */
/**
 * ESLint 8 + TypeScript（无 project 类型检查，避免拖慢 CI；与 npm overrides 中 eslint 使用 ajv@6 / minimatch@3 对齐）
 */
module.exports = {
  root: true,
  env: { node: true, es2022: true, jest: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/eslint-recommended'],
  ignorePatterns: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.d.ts'],
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    'no-console': 'off',
  },
};
