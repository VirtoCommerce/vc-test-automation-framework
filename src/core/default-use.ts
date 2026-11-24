import type { PlaywrightTestOptions, PlaywrightWorkerOptions } from "@playwright/test";
import type { Env } from "./env.ts";

/** The options of {@link defaultUse}. */
export interface DefaultUseOptions {
  /**
   * The attribute that `getByTestId` reads. The default is `data-test-id`, the attribute of the Virto Commerce
   * frontend.
   */
  readonly testIdAttribute?: string | undefined;
}

/** The base `use` options of a test suite, as {@link defaultUse} returns them. */
export type DefaultUse = Pick<
  PlaywrightTestOptions & PlaywrightWorkerOptions,
  "ignoreHTTPSErrors" | "trace" | "screenshot" | "video" | "testIdAttribute"
>;

/**
 * Returns the base `use` options of a test suite: the certificate check from the environment, and the evidence of
 * failed tests.
 *
 * @remarks
 * A failed test keeps its trace, a screenshot and a video; a passed test keeps none. Screenshots and videos apply only
 * to tests that use a browser.
 *
 * @example
 * use: { ...defaultUse(env), baseURL: env.FRONTEND_BASE_URL },
 *
 * @param env - The parsed environment variables.
 * @param options - The test id attribute.
 * @returns The options, for the `use` option of the Playwright config or of a project.
 */
export function defaultUse(env: Env, options: DefaultUseOptions = {}): DefaultUse {
  return {
    ignoreHTTPSErrors: !env.VERIFY_SSL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    testIdAttribute: options.testIdAttribute ?? "data-test-id",
  };
}
