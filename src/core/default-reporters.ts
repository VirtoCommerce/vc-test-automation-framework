import type { ReporterDescription } from "@playwright/test";

import { join } from "node:path";

import { maskSecrets } from "./secret.ts";

/** The options of {@link defaultReporters}. */
export interface DefaultReporterOptions {
  /** The directory that the reporters write to, each in its own subdirectory, such as `reports` next to the config. */
  readonly outputDir: string;
  /**
   * The environment of the run, shown in the report, such as the platform URL and the store. Registered secrets in the
   * values are masked.
   */
  readonly environment?: Readonly<Record<string, string>> | undefined;
}

/**
 * Returns the default reporters of a test suite: a line for each test on the console, and results to generate a
 * report from.
 *
 * @remarks
 * The report is an Allure report: the results are written to `allure-results` in `outputDir`, and need
 * `allure-playwright`, an optional peer dependency that the test suite installs. Playwright loads it by name when the
 * run starts, so the framework does not depend on it. A test suite that reports in another way sets its own
 * `reporter`, or adds its reporters to these.
 *
 * @example
 * reporter: defaultReporters({
 *   outputDir: fileURLToPath(new URL("reports", import.meta.url)),
 *   environment: { backend: env.BACKEND_BASE_URL },
 * }),
 *
 * @param options - The output directory and the environment of the run.
 * @returns The reporters, for the `reporter` option of the Playwright config.
 */
export function defaultReporters(options: DefaultReporterOptions): ReporterDescription[] {
  const envEntries = Object.entries(options.environment ?? {});
  const environment = envEntries.map(([key, value]) => [key, maskSecrets(value)]);
  return [
    ["list"],
    [
      "allure-playwright",
      {
        resultsDir: join(options.outputDir, "allure-results"),
        environmentInfo: Object.fromEntries(environment),
      },
    ],
  ];
}
