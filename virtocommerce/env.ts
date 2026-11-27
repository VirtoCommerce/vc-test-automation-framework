import type { output } from "zod";

import { existsSync } from "node:fs";

import {
  envSchema,
  nonBlankString,
  originUrl,
  parseEnv,
  secretString,
} from "@virtocommerce/test-automation-framework/core";
import { enum as oneOf } from "zod";

const ENV_FILE = new URL(".env", import.meta.url);

if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

/** The environment variables of the Virto Commerce test suite. */
export const suiteEnvSchema = envSchema.extend({
  /** The origin of the frontend that serves the store, such as `https://frontend.example.com`. */
  FRONTEND_BASE_URL: originUrl,
  /** The password of every dataset user. */
  USERS_PASSWORD: secretString,
  /** The Google Maps key written into the settings of the seeded store. Without it, maps stay off. */
  GOOGLE_MAPS_API_KEY: secretString.optional(),
  /** The dataset collections to seed, as a comma-separated list, instead of every collection. */
  SEED_ONLY: nonBlankString.optional(),
  /** The path of the page builder app on the platform. */
  PAGE_BUILDER_PATH: nonBlankString.regex(/^\/.*\/$/, "must start and end with /").default("/apps/page-builder-shell/"),
  /** The quantity control that the frontend is configured with. */
  QUANTITY_CONTROL: oneOf(["stepper", "button"]).default("stepper"),
  /** The style of the range filters that the frontend is configured with. */
  RANGE_FILTER_TYPE: oneOf(["slider", "default"]).default("slider"),
  /** The checkout flow that the frontend is configured with. */
  CHECKOUT_MODE: oneOf(["single-page", "multi-step"]).default("single-page"),
});

/** The parsed environment variables of the Virto Commerce test suite. */
export type SuiteEnv = output<typeof suiteEnvSchema>;

/** The parsed environment variables of the Virto Commerce test suite. */
export const env = parseEnv(suiteEnvSchema);
