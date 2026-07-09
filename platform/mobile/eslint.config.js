const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');
const globals = require('globals');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/.expo/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/navigation/index.legacy.tsx',
    ],
  },
  ...compat.extends('expo'),
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['apps/client/tsconfig.json', 'apps/restaurant/tsconfig.json'],
          alwaysTryTypes: true,
        },
      },
      // Test files import from 'vitest'; runtime resolves it via jest.config.js'
      // moduleNameMapper (shared/testing/vitest-shim.js). Tell eslint-plugin-import
      // to treat it as always-resolvable so it doesn't flag a false positive here.
      'import/core-modules': ['vitest'],
    },
    rules: {
      'prettier/prettier': 'off',
      // eslint-config-expo@7 targets @typescript-eslint@6/7; this project pins @typescript-eslint@8,
      // which removed/renamed some rules the base config still references.
      '@typescript-eslint/ban-types': 'off',
    },
  },
];
