import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";
import {
  apiProject,
  DESTRUCTIVE_TAG,
  defaultReporters,
  defaultRunOptions,
  defaultUse,
  e2eProject,
  envSchema,
  parseEnv,
} from "@virtocommerce/test-automation-framework/core";

const env = parseEnv(envSchema);

export default defineConfig({
  ...defaultRunOptions(env),
  reporter: defaultReporters({
    outputDir: fileURLToPath(new URL("reports", import.meta.url)),
    environment: { backend: env.BACKEND_BASE_URL },
  }),
  use: defaultUse(env),
  projects: [
    { name: "seed", testDir: "setup", testMatch: "seed.setup.ts" },
    apiProject(env, { name: "rest", testDir: "tests/rest", dependencies: ["seed"] }),
    e2eProject(env, {
      name: "frontend",
      testDir: "tests/e2e",
      dependencies: ["seed"],
      use: { ...devices["Desktop Chrome"] },
    }),
  ],
});

export const destructiveTestDetails = { tag: DESTRUCTIVE_TAG };
