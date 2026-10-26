import { defineConfig } from "vitest/config";

// Unit tests for the app's business rules (billing, units, programme
// validation, roles). They never touch AWS — DynamoDB is mocked per test.
// End-to-end tests live in tests/e2e and run with Playwright instead.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.js"],
  },
});
