import type { PlaywrightTestConfig } from "@playwright/test";
import type { Env } from "./env.ts";

import { isCi } from "./is-ci.ts";

/** The tag of tests that delete or change shared data. They run only when `RUN_DESTRUCTIVE_TESTS` is on. */
export const DESTRUCTIVE_TAG = "@destructive";

/**
 * The tag of tests that fail because of a known platform defect. They are left out when `SKIP_PLATFORM_DEFECTS` is on,
 * so that the CI of the platform and its modules is not red for a defect that a ticket already tracks.
 */
export const PLATFORM_DEFECT_TAG = "@platform-defect";

/** The run options of a test suite, as {@link defaultRunOptions} returns them. */
export type DefaultRunOptions = Pick<PlaywrightTestConfig, "forbidOnly" | "retries" | "workers" | "grepInvert">;

/**
 * Returns the run options of a test suite: no retries, no `test.only` on CI, the workers of the larger worker budget,
 * and destructive tests and known platform defects left out as the environment says.
 *
 * @remarks
 * - Failed tests are not retried, so a flaky test fails and is fixed rather than hidden.
 * - `workers` is the larger of `API_WORKERS` and `E2E_WORKERS`. Each project stays within its own limit, see
 *   {@link apiProject} and {@link e2eProject}, and API and browser projects that run at the same time share these
 *   workers instead of adding up.
 * - Tests tagged with {@link DESTRUCTIVE_TAG} are left out unless `RUN_DESTRUCTIVE_TESTS` is on, and tests tagged with
 *   {@link PLATFORM_DEFECT_TAG} when `SKIP_PLATFORM_DEFECTS` is on. A project that sets its own `grepInvert` replaces
 *   this filter.
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
    ...leftOut(env),
  };
}

function leftOut(env: Env): Pick<DefaultRunOptions, "grepInvert"> {
  const tags = [
    ...(env.RUN_DESTRUCTIVE_TESTS ? [] : [DESTRUCTIVE_TAG]),
    ...(env.SKIP_PLATFORM_DEFECTS ? [PLATFORM_DEFECT_TAG] : []),
  ];
  return tags.length === 0 ? {} : { grepInvert: new RegExp(`(${tags.join("|")})(?=\\s|$)`) };
}
