import type { BrowserOptions } from "@fixtures";

import { defineConfig, devices } from "@playwright/test";

import { getEnv } from "@core/env";

const env = getEnv();

const MODULES_SETUP = ["modules"];
const API_TEST_TIMEOUT_MS = 90_000;
const BROWSER_TEST_TIMEOUT_MS = 120_000;
const BROWSER_EXPECT_TIMEOUT_MS = 30_000;
const BROWSER_USE = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1920, height: 1080 },
  ignoreHTTPSErrors: !env.verifySsl,
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
  actionTimeout: 30_000,
  navigationTimeout: 30_000,
} as const;

export default defineConfig<BrowserOptions>({
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: [["list"], ["allure-playwright", { resultsDir: "allure-results" }]],
  use: { testIdAttribute: "data-test-id" },
  projects: [
    {
      name: "unit",
      testDir: "tests/unit",
    },
    {
      name: "modules",
      testDir: "tests/setup",
      testMatch: "modules.setup.ts",
      retries: 0,
      use: { trace: "retain-on-failure" },
    },
    {
      name: "seed",
      testDir: "tests/setup",
      testMatch: "seed.setup.ts",
      dependencies: MODULES_SETUP,
      retries: 0,
      use: { trace: "retain-on-failure" },
    },
    {
      name: "graphql",
      dependencies: MODULES_SETUP,
      testDir: "tests/graphql",
      workers: env.apiWorkers,
      timeout: API_TEST_TIMEOUT_MS,
      use: { trace: "retain-on-failure" },
    },
    {
      name: "restapi",
      dependencies: MODULES_SETUP,
      testDir: "tests/restapi",
      workers: env.apiWorkers,
      timeout: API_TEST_TIMEOUT_MS,
      use: { trace: "retain-on-failure" },
    },
    {
      name: "e2e-frontend",
      dependencies: MODULES_SETUP,
      testDir: "tests/e2e/frontend",
      workers: env.frontendWorkers,
      timeout: BROWSER_TEST_TIMEOUT_MS,
      expect: { timeout: BROWSER_EXPECT_TIMEOUT_MS },
      use: { ...BROWSER_USE, app: "frontend", baseURL: env.frontendBaseUrl },
    },
    {
      name: "e2e-backend",
      dependencies: MODULES_SETUP,
      testDir: "tests/e2e/backend",
      workers: 1,
      timeout: BROWSER_TEST_TIMEOUT_MS,
      expect: { timeout: BROWSER_EXPECT_TIMEOUT_MS },
      use: { ...BROWSER_USE, app: "backend", baseURL: env.backendBaseUrl },
    },
    ...(env.runDestructiveTests
      ? [
          {
            name: "isolated",
            dependencies: MODULES_SETUP,
            testDir: "tests/isolated",
            timeout: API_TEST_TIMEOUT_MS,
            workers: 1,
            use: { trace: "retain-on-failure" },
          } as const,
        ]
      : []),
  ],
});
