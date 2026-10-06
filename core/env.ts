import type { output } from "zod";

import { coerce, enum as enumOf, object, string, stringbool, url } from "zod";

import { deepFreeze } from "./deep-freeze";
import { nonEmptyString, parseOrThrow } from "./validation";

const positiveInt = coerce.number().int().positive();

const EnvSchema = object({
  BACKEND_BASE_URL: url(),
  FRONTEND_BASE_URL: url(),
  PAGE_BUILDER_PATH: string().default("/apps/page-builder-shell/"),
  STORE_ID: nonEmptyString,
  ADMIN_USERNAME: nonEmptyString,
  ADMIN_PASSWORD: nonEmptyString,
  USERS_PASSWORD: nonEmptyString,
  GOOGLE_MAPS_API_KEY: string().default(""),
  REQUEST_TIMEOUT_MS: positiveInt.default(30_000),
  VERIFY_SSL: stringbool().default(true),
  RUN_DESTRUCTIVE_TESTS: stringbool().default(false),
  E2E_WORKERS: positiveInt.default(3),
  QUANTITY_CONTROL: enumOf(["stepper", "button"]).default("stepper"),
  RANGE_FILTER_TYPE: enumOf(["slider", "default"]).default("slider"),
  CHECKOUT_MODE: enumOf(["single-page", "multi-step"]).default("single-page"),
  SEED_ONLY: string().optional(),
}).transform((vars) =>
  deepFreeze({
    backendBaseUrl: vars.BACKEND_BASE_URL,
    frontendBaseUrl: vars.FRONTEND_BASE_URL,
    pageBuilderPath: vars.PAGE_BUILDER_PATH,
    storeId: vars.STORE_ID,
    admin: {
      username: vars.ADMIN_USERNAME,
      password: vars.ADMIN_PASSWORD,
    },
    usersPassword: vars.USERS_PASSWORD,
    googleMapsApiKey: vars.GOOGLE_MAPS_API_KEY,
    requestTimeoutMs: vars.REQUEST_TIMEOUT_MS,
    verifySsl: vars.VERIFY_SSL,
    runDestructiveTests: vars.RUN_DESTRUCTIVE_TESTS,
    e2eWorkers: vars.E2E_WORKERS,
    quantityControl: vars.QUANTITY_CONTROL,
    rangeFilterType: vars.RANGE_FILTER_TYPE,
    checkoutMode: vars.CHECKOUT_MODE,
    seedOnly: vars.SEED_ONLY,
  }),
);

export type Env = output<typeof EnvSchema>;

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  cachedEnv ??= parseOrThrow(EnvSchema, process.env, "Invalid environment");
  return cachedEnv;
}
