// jest.config.js — CommonJS to avoid needing ts-node for config parsing
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  // Exclude setup.ts from being treated as a test suite
  testPathIgnorePatterns: ['/node_modules/', 'setup\\.ts$'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
        diagnostics: {
          ignoreCodes: ['TS151001'],
        },
      },
    ],
  },
  moduleNameMapper: {
    // ts-jest under CommonJS can't resolve Node16/NodeNext .js extensions
    // Map x.js -> x.ts so resolution finds the TypeScript source files
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^react-native-cloud-storage$':
      '<rootDir>/src/__mocks__/react-native-cloud-storage.ts',
  },
  // setupFiles runs before the test framework (no Jest globals yet — fine here)
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/__tests__/**',
    '!src/__mocks__/**',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      lines: 90,
      branches: 80,
      functions: 90,
      statements: 90,
    },
  },
  coverageReporters: ['text', 'lcov'],
};
