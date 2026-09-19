// Two projects, because they have different requirements:
//
//   unit        — no database. Runs anywhere, including a CI box with no
//                 Mongo binary. Covers validation, RBAC, error shape, money.
//   integration — needs a real MongoDB (mongodb-memory-server downloads one on
//                 first run). Covers everything that issues a query.
//
//   npm run test:unit         fast, no network
//   npm test                  both
export default {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform: {},
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      transform: {},
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
    },
  ],
  // Top level, not per-project: Jest does not recognise testTimeout inside a
  // project config and warns on every run. The integration project is the one
  // that needs it — the Mongo binary is downloaded once on the first run.
  testTimeout: 60_000,
};
