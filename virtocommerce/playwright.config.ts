import type { SuiteFixtures } from "./fixtures/index.ts";

import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";
import {
  apiProject,
  defaultReporters,
  defaultRunOptions,
  defaultUse,
  e2eProject,
} from "@virtocommerce/test-automation-framework/core";

import { env } from "./env.ts";

export default defineConfig<Pick<SuiteFixtures, "app">>({
  ...defaultRunOptions(env),
  reporter: defaultReporters({
    outputDir: fileURLToPath(new URL("reports", import.meta.url)),
    environment: {
      backend: env.BACKEND_BASE_URL,
      frontend: env.FRONTEND_BASE_URL,
    },
  }),
  use: defaultUse(env),
  projects: [
    {
      name: "seed",
      testDir: "setup",
      testMatch: "seed.setup.ts",
    },
    apiProject(env, {
      name: "restapi",
      testDir: "tests/restapi",
      dependencies: ["seed"],
    }),
    apiProject(env, {
      name: "isolated",
      testDir: "tests/isolated",
      workers: 1,
      dependencies: ["seed"],
    }),
    apiProject(env, {
      name: "graphql",
      testDir: "tests/graphql",
      dependencies: ["seed"],
    }),
    e2eProject(env, {
      name: "e2e-backend",
      testDir: "tests/e2e/backend",
      workers: 1,
      timeout: 60_000,
      expect: { timeout: 10_000 },
      dependencies: ["seed"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        app: "backend",
        baseURL: env.BACKEND_BASE_URL,
      },
    }),
    e2eProject(env, {
      name: "e2e-frontend",
      testDir: "tests/e2e/frontend",
      timeout: 60_000,
      expect: { timeout: 10_000 },
      dependencies: ["seed"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        app: "frontend",
        baseURL: env.FRONTEND_BASE_URL,
      },
    }),
  ],
});
