import type { PlaywrightTestConfig } from "@playwright/test";
import type { Env } from "./env.ts";

import { isCi } from "./is-ci.ts";

/** The tag of tests that delete or change shared data. They run only when `RUN_DESTRUCTIVE_TESTS` is on. */
export const DESTRUCTIVE_TAG = "@destructive";

/** The run options of a test suite, as {@link defaultRunOptions} returns them. */
export type DefaultRunOptions = Pick<PlaywrightTestConfig, "forbidOnly" | "retries" | "workers" | "grepInvert">;

/**
 * Returns the run options of a test suite: no retries, no `test.only` on CI, the workers of the larger worker budget,
 * and destructive tests left out unless the environment allows them.
 *
 * @remarks
 * - Failed tests are not retried, so a flaky test fails and is fixed rather than hidden.
 * - `workers` is the larger of `API_WORKERS` and `E2E_WORKERS`. Each project stays within its own limit, see
 *   {@link apiProject} and {@link e2eProject}, and API and browser projects that run at the same time share these
 *   workers instead of adding up.
 * - Tests tagged with {@link DESTRUCTIVE_TAG} are left out unless `RUN_DESTRUCTIVE_TESTS` is on. A project that sets
 *   its own `grepInvert` replaces this filter.
 *
 * @example
 * export default defineConfig({ ...defaultRunOptions(env), projects: [] });
 *
 * @param env - The parsed environment variables.
 * @returns The options, to spread into the Playwright config.
 */
export function defaultRunOptions(env: Env): DefaultRunOptions {
  return {
    forbidOnly: isCi(),
    retries: 0,
    workers: Math.max(env.API_WORKERS, env.E2E_WORKERS),
    ...(env.RUN_DESTRUCTIVE_TESTS ? {} : { grepInvert: new RegExp(`${DESTRUCTIVE_TAG}(?=\\s|$)`) }),
  };
}
