import type { ReporterDescription } from "@playwright/test";

import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { maskSecrets } from "./secret.ts";

const SECRET_MASKING_REPORTER = fileURLToPath(
  new URL(`./secret-masking-reporter${extname(fileURLToPath(import.meta.url))}`, import.meta.url),
);

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
 * Returns the default reporters of a test suite: a line for each test on the console, results to generate a report
 * from, and {@link SecretMaskingReporter}, which masks registered secrets in those results.
 *
 * @remarks
 * - The report is an Allure report: the results are written to `allure-results` in `outputDir`, and need
 *   `allure-playwright`, an optional peer dependency that the test suite installs. Playwright loads it by name when the
 *   run starts, so the framework does not depend on it.
 * - When the run ends, `SecretMaskingReporter` masks the registered secrets, such as the passwords of the environment,
 *   in the text files of the results and of the output directories of the projects. Traces, screenshots and videos
 *   are not masked.
 * - A test suite that reports in another way sets its own `reporter`, or adds its reporters to these.
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
  const resultsDir = join(options.outputDir, "allure-results");
  const environment = Object.entries(options.environment ?? {}).map(([key, value]) => [key, maskSecrets(value)]);
  return [
    ["list"],
    ["allure-playwright", { resultsDir, environmentInfo: Object.fromEntries(environment) }],
    [SECRET_MASKING_REPORTER, { dirs: [resultsDir] }],
  ];
}
