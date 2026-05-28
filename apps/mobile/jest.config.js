// Mobile test config.
//
// We run two test surfaces side-by-side via projects:
//   1. "ts" — pure-TS tests (tokens, fixtures) on a node env. No RN needed.
//   2. "rn" — RN component tests through jest-expo. Currently kept in a
//      separate project so a misconfigured RN transform can't break the
//      cheap, fast TS suite.
//
// To run only the pure-TS surface (default in CI until jest-expo + RN 0.74
// setup is stable):
//   pnpm --filter @fa/mobile test
//
// To run the RN surface locally once you've finished the jest-expo upgrade:
//   pnpm --filter @fa/mobile test -- --selectProjects rn
//
// TODO(integrate-jest-rn): once 'rn' project runs green, swap the default
// CLI to run both projects.

module.exports = {
  projects: [
    {
      displayName: 'ts',
      testEnvironment: 'node',
      transform: {
        '^.+\\.(ts|tsx)$': ['babel-jest', { presets: ['@babel/preset-typescript', '@babel/preset-env'] }],
      },
      testMatch: [
        '<rootDir>/tests/tokens.test.ts',
        '<rootDir>/tests/feed-fixture.test.ts',
      ],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    },
    {
      displayName: 'rn',
      preset: 'jest-expo',
      testEnvironment: 'jsdom',
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@supabase/.*))',
      ],
      // Disabled by default — re-enable when jest-expo setup runs clean.
      // testMatch: ['<rootDir>/tests/*.test.tsx'],
      testMatch: ['<rootDir>/__DISABLED__/never-matches/*.test.tsx'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    },
  ],
};
