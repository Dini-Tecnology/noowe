module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    // `transform` substitui inteiramente o do preset react-native, em vez de se
    // somar a ele.  Sem a entrada de babel-jest abaixo, nenhum arquivo .js recebe
    // transformador — incluindo react-native/jest/setup.js, que é ESM — e toda
    // suite morre em "Cannot use import statement outside a module".
    '^.+\\.(js|jsx|mjs)$': 'babel-jest',
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  transformIgnorePatterns: [
    // Este repositório usa pnpm, então o caminho real de um pacote é
    // `node_modules/.pnpm/<pacote>@<versao>_<hash>/node_modules/<pacote>/...`.
    // Um padrão escrito para o layout do npm avalia o lookahead no primeiro
    // `node_modules/`, encontra `.pnpm` — que não está na lista — e ignora o
    // pacote inteiro.  Por isso o filtro casa o diretório de dentro do `.pnpm`,
    // onde pnpm troca `/` por `+` nos pacotes com escopo.
    // O lookahead casa por PREFIXO do diretório: pnpm sempre acrescenta
    // `@<versao>` ao nome, então exigir o `@` logo após o prefixo impediria
    // `@react-native+js-polyfills@0.81.5` de casar com `@react-native+`.
    'node_modules/\\.pnpm/(?!(react-native|@react-native|@react-navigation|expo|@expo|@shopify\\+flash-list|@sentry\\+react-native|@tanstack\\+react-query|@react-native-firebase))',
  ],
  moduleNameMapper: {
    '^react-native-vector-icons/MaterialCommunityIcons$':
      '<rootDir>/__mocks__/rnMaterialCommunityIcons.tsx',
    '^vitest$': '<rootDir>/shared/testing/vitest-shim.js',
    '^@/(.*)$': '<rootDir>/shared/$1',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/__mocks__/fileMock.js',
  },
  collectCoverageFrom: [
    'apps/**/*.{ts,tsx}',
    'shared/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/*.test.{ts,tsx}',
    '!**/*.spec.{ts,tsx}',
    '!**/coverage/**',
    '!apps/**/metro.config.js',
    '!apps/**/app.config.js',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testMatch: [
    '**/__tests__/**/*.{ts,tsx}',
    '**/*.test.{ts,tsx}',
    '**/*.spec.{ts,tsx}',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react',
      },
    },
  },
};
