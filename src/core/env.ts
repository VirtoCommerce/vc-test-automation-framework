import type { output } from "zod";

import { object } from "zod";

import { booleanString, nonBlankString, originUrl, positiveInt, secretString } from "./string-schemas.ts";

/**
 * The environment variables that every Virto Commerce-based solution needs.
 *
 * @remarks
 * Test suites extend this schema with their own variables. They can also redefine a variable to change its default.
 *
 * @example
 * const suiteEnvSchema = envSchema.extend({ API_WORKERS: positiveInt.default(8), MAILBOX_URL: absoluteUrl });
 * const env = parseEnv(suiteEnvSchema);
 */
export const envSchema = object({
  /** The origin of the Virto Commerce platform, such as `https://platform.example.com`. */
  BACKEND_BASE_URL: originUrl,
  /** The user name of the platform administrator account that the tests sign in with. */
  ADMIN_USERNAME: nonBlankString,
  /** The password of the platform administrator account. */
  ADMIN_PASSWORD: secretString,
  /** Whether to verify the TLS certificate of the platform. The default is `true`. */
  VERIFY_SSL: booleanString.default(true),
  /** The time to wait for a response, in milliseconds. The default is 30000. */
  REQUEST_TIMEOUT_MS: positiveInt.default(30_000),
  /** Whether to run tests that delete or change shared data. The default is `false`. */
  RUN_DESTRUCTIVE_TESTS: booleanString.default(false),
  /** The number of workers that run API tests, such as REST and GraphQL tests. The default is 4. */
  API_WORKERS: positiveInt.default(4),
  /** The number of workers that run end-to-end browser tests. The default is 3. */
  E2E_WORKERS: positiveInt.default(3),
});

/** The environment variables parsed by {@link envSchema}. */
export type Env = output<typeof envSchema>;
