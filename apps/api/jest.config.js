/**
 * Unit tests: src/**\/*.spec.ts
 * HTTP integration tests (Supertest): ../../tests/integration/**\/*.spec.ts
 * Workspace packages (@lex/*) resolve to their dist/ — run `pnpm build:packages` first
 * (the root `pnpm test` does this automatically).
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/../../tests/integration"],
  testMatch: ["**/*.spec.ts"],
  // Integration tests live outside this package; resolve their imports from here.
  modulePaths: ["<rootDir>/node_modules"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }] },
};
