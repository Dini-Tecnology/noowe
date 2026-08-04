module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  testMatch: ['<rootDir>/src/__tests__/production.*.test.ts?(x)'],
  moduleNameMapper: {
    '^@/shared/(.*)$': '<rootDir>/../../shared/$1',
    '^@okinawa/shared/(.*)$': '<rootDir>/../../shared/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-.*|@supabase/.*|@react-navigation/.*|react-native-.*)/)',
  ],
  clearMocks: true,
  collectCoverageFrom: ['src/services/customer-backend.ts', 'src/contexts/VisitSessionContext.tsx'],
};
