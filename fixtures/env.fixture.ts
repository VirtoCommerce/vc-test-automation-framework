import type { Env } from "@core/env";

import { test as base } from "@playwright/test";

import { getEnv } from "@core/env";

/** The run's configuration, shared by every test of a worker. */
export interface EnvFixtures {
  /** The validated, frozen {@link Env} from {@link getEnv}. */
  readonly env: Env;
}

/** Adds the worker-scoped {@link EnvFixtures} to Playwright's base `test`. */
export const test = base.extend<object, EnvFixtures>({
  env: [
    async ({}, use) => {
      await use(getEnv());
    },
    { scope: "worker" },
  ],
});
