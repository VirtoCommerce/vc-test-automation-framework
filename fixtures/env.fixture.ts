import type { Env } from "@core/env";

import { test as base } from "@playwright/test";

import { getEnv } from "@core/env";

import { markListedTest } from "./known-issue";

/** The run's configuration, shared by every test of a worker. */
export interface EnvFixtures {
  /** The validated, frozen {@link Env} from {@link getEnv}. */
  readonly env: Env;
}

interface KnownIssueFixtures {
  readonly _listedKnownIssues: undefined;
}

/**
 * Adds the worker-scoped {@link EnvFixtures} to Playwright's base `test`, and marks every test that a known issue's
 * `tests` patterns name before it runs.
 */
export const test = base.extend<KnownIssueFixtures, EnvFixtures>({
  _listedKnownIssues: [
    async ({}, use, testInfo) => {
      await markListedTest(testInfo);
      await use(undefined);
    },
    { auto: true },
  ],

  env: [
    async ({}, use) => {
      await use(getEnv());
    },
    { scope: "worker" },
  ],
});
