import type { output } from "zod";

import { existsSync } from "node:fs";

import { envSchema, nonBlankString, originUrl, parseEnv } from "@virtocommerce/test-automation-framework/core";

const ENV_FILE = new URL(".env", import.meta.url);

if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

/** The environment variables of the test suite. */
export const suiteEnvSchema = envSchema.extend({
  /** The origin of the frontend, such as `https://frontend.example.com`. */
  FRONTEND_BASE_URL: originUrl,
  /** The identifier of the store that the frontend serves, such as `B2B-store`. */
  STORE_ID: nonBlankString,
  /** The attribute that `getByTestId` reads in the frontend. The default is `data-test-id`. */
  FRONTEND_TEST_ID_ATTRIBUTE: nonBlankString.default("data-test-id"),
});

/** The parsed environment variables of the test suite. */
export type SuiteEnv = output<typeof suiteEnvSchema>;

/** The parsed environment variables of the test suite. */
export const env = parseEnv(suiteEnvSchema);
