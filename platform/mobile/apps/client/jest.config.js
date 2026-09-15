module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  testMatch: ['<rootDir>/src/__tests__/production.*.test.ts?(x)'],
  moduleNameMapper: {
    '^@/shared/(.*)$': '<rootDir>/../../shared/$1',
    '^@okinawa/shared/(.*)$': '<rootDir>/../../shared/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Dois padrões, um por layout de instalação.  O CI instala com npm (pacote em
  // `node_modules/<pacote>`); a máquina de desenvolvimento usa pnpm (pacote em
  // `node_modules/.pnpm/<pacote>@<versão>/node_modules/<pacote>`, com `/` do escopo
  // trocado por `+`).  O primeiro padrão deixa passar `.pnpm`; o segundo filtra dentro
  // dele por prefixo, como em platform/mobile/jest.config.js.
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-.*|@supabase/.*|@react-navigation/.*|react-native-.*)/)',
    'node_modules/\\.pnpm/(?!((jest-)?react-native|@react-native|expo|@expo|@supabase|@react-navigation))',
  ],
  clearMocks: true,
  collectCoverageFrom: ['src/services/customer-backend.ts', 'src/contexts/VisitSessionContext.tsx'],
};
