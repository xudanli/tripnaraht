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
  overrides: [
    {
      files: [
        'src/agent/**/*.ts',
        'src/guide-to-plan/**/*.ts',
        'src/trips/decision/**/*.ts',
        'src/trips/guardian-decision-core/adapters/**/*.ts',
        'src/trips/guardian-decision-core/services/**/*.ts',
        'src/trips/guardian-decision-core/shadow/**/*.ts',
      ],
      excludedFiles: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/e2e/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/plan-version/plan-version.store', '**/plan-version.store'],
                message:
                  'Effective Plan writes must go through DecisionCore.finalize → authorize → EffectivePlanExecutor. Do not import plan-version.store directly.',
              },
              {
                group: [
                  '**/rfc001-itinerary-materializer.service',
                  '**/execution/rfc001-itinerary-materializer.service',
                ],
                message:
                  'Itinerary materialization must run inside EffectivePlanExecutor only.',
              },
            ],
          },
        ],
      },
    },
  ],
};
