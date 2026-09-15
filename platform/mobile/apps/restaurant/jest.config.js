/**
 * Jest Configuration for Restaurant App
 * 
 * Configures test environment, coverage thresholds, and module resolution
 * for the Okinawa Restaurant management application.
 * 
 * @module jest.config
 */

module.exports = {
  // 'jest-expo' was referenced here but never installed anywhere in this
  // monorepo — every test run against it failed at config validation before
  // collecting a single test. Installed as a devDependency (matching the
  // app's Expo SDK 54) so LoginScreen.test.tsx can fully render a real
  // component tree; the plain 'react-native' preset doesn't wire up the
  // native module bridge that react-native-paper/@expo/vector-icons need.
  preset: 'jest-expo',

  // Node environment for faster test execution
  testEnvironment: 'node',

  // Test root directory
  roots: ['<rootDir>/src'],

  // Test file patterns to match
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],

  // File extensions to process
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Expo's Babel preset transforms both React Native's ESM setup files and
  // TypeScript. Restricting the transform to ts-jest left RN's .js files
  // untransformed and made Jest fail before collecting any tests.
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },

  // pnpm nests React Native under node_modules/.pnpm before the package's own
  // node_modules directory. Transform dependencies so the ESM setup shipped
  // by RN/Expo is compiled in both npm and pnpm layouts.
  transformIgnorePatterns: [],
  
  // Module path aliases matching tsconfig. More specific patterns must come
  // before the generic '^@/(.*)$' one, otherwise it wins first and resolves
  // '@/shared/...' to the nonexistent 'src/shared/...' instead of the
  // monorepo-level shared/ package.
  moduleNameMapper: {
    '^vitest$': '<rootDir>/../../shared/testing/vitest-shim.js',
    '^@okinawa/shared/(.*)$': '<rootDir>/../../shared/$1',
    '^@/shared/(.*)$': '<rootDir>/../../shared/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    // Covers both the barrel import and subpath imports like
    // '@expo/vector-icons/MaterialCommunityIcons' — see src/__mocks__/vectorIconMock.js
    // for why (avoids pulling in expo-font/expo-modules-core native code).
    '^@expo/vector-icons(/.*)?$': '<rootDir>/src/__mocks__/vectorIconMock.js',
  },
  
  // Setup files to run after Jest is initialized
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  
  // Coverage collection patterns
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
  ],
  
  // Coverage thresholds - must maintain at least 70%
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  
  // Paths to ignore during testing
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // Enable verbose output for debugging
  verbose: true,

};
