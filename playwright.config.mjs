import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests: drive the real app in a browser, signed in as test
// accounts for each role, read from .env.e2e (git-ignored) — see
// tests/README.md for what goes in it. Run against a dev/test environment,
// never production: some tests create and delete data.
if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  // The tests share a handful of accounts, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Signs in once per role and saves the session for the other tests.
    { name: "setup", testMatch: /auth\.setup\.js/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /mobile\.spec\.js/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
      testMatch: /mobile\.spec\.js/,
    },
  ],
  // Starts `npm run dev` unless E2E_BASE_URL points at a running app.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
