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
    apiProject(env, {
      name: "restapi",
      testDir: "tests/restapi",
    }),
    apiProject(env, {
      name: "graphql",
      testDir: "tests/graphql",
    }),
    e2eProject(env, {
      name: "e2e-frontend",
      testDir: "tests/e2e/frontend",
      timeout: 60_000,
      expect: { timeout: 10_000 },
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        app: "frontend",
        baseURL: env.FRONTEND_BASE_URL,
      },
    }),
  ],
});
