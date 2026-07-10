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

  // TypeScript transformation
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },

  // Same allow-list as the root jest.config.js: these packages ship
  // untranspiled ESM and must be run back through Babel/ts-jest.
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|expo|@expo|react-native-paper|react-native-vector-icons|@shopify/flash-list|@react-native-firebase|@sentry/react-native|expo-.*|@tanstack/react-query)/)',
  ],
  
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

  // Without this, ts-jest compiles .tsx with the default 'preserve' JSX
  // mode, which leaves raw JSX in the output and crashes at require-time
  // with "Unexpected token '<'".
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react',
      },
    },
  },
};
