// Pure-TS test config. RN component tests are temporarily skipped pending
// jest-expo + RN 0.74 setup-file fix — see apps/mobile/README.md.
// TODO(integrate-jest-rn): enable preset 'jest-expo' once setup.js parses.
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["babel-jest", { presets: ["@babel/preset-typescript", "@babel/preset-env"] }],
  },
  testMatch: [
    "**/tests/tokens.test.ts",
    "**/tests/feed-fixture.test.ts",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
