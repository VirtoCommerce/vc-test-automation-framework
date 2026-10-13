import type { output } from "zod";

import { existsSync } from "node:fs";

import { enum as enumOf, object, string, stringbool } from "zod";

import { deepFreeze } from "./deep-freeze";
import { Secret } from "./secret";
import { nonEmptyString, originUrl, parseOrThrow, positiveInt, secretString, urlPath } from "./validation";

/** Schema of the environment variables, mapped onto {@link Env}; unknown variables are ignored. */
const EnvSchema = object({
  BACKEND_BASE_URL: originUrl,
  FRONTEND_BASE_URL: originUrl,
  PAGE_BUILDER_PATH: urlPath.default("/apps/page-builder-shell/"),
  STORE_ID: nonEmptyString,
  ADMIN_USERNAME: nonEmptyString,
  ADMIN_PASSWORD: secretString,
  USERS_PASSWORD: secretString,
  GOOGLE_MAPS_API_KEY: string()
    .default("")
    .transform((value) => new Secret(value)),
  REQUEST_TIMEOUT_MS: positiveInt.default(30_000),
  VERIFY_SSL: stringbool().default(true),
  RUN_DESTRUCTIVE_TESTS: stringbool().default(false),
  API_WORKERS: positiveInt.default(4),
  FRONTEND_WORKERS: positiveInt.default(3),
  QUANTITY_CONTROL: enumOf(["stepper", "button"]).default("stepper"),
  RANGE_FILTER_TYPE: enumOf(["slider", "default"]).default("slider"),
  CHECKOUT_MODE: enumOf(["single-page", "multi-step"]).default("single-page"),
  SEED_ONLY: nonEmptyString.optional(),
}).transform((vars) =>
  deepFreeze({
    /** `BACKEND_BASE_URL` (required): platform origin for REST, GraphQL and the admin UI. */
    backendBaseUrl: vars.BACKEND_BASE_URL,
    /** `FRONTEND_BASE_URL` (required): frontend origin for browser tests. */
    frontendBaseUrl: vars.FRONTEND_BASE_URL,
    /** `PAGE_BUILDER_PATH` (default `/apps/page-builder-shell/`): page builder shell app path on the platform. */
    pageBuilderPath: vars.PAGE_BUILDER_PATH,
    /** `STORE_ID` (required): the store seeded and signed in to; the frontend must serve it. */
    storeId: vars.STORE_ID,
    /** Platform administrator account; seeds the dataset and signs in to the admin UI. */
    admin: {
      /** `ADMIN_USERNAME` (required). */
      username: vars.ADMIN_USERNAME,
      /** `ADMIN_PASSWORD` (required). */
      password: vars.ADMIN_PASSWORD,
    },
    /** `USERS_PASSWORD` (required): password of every dataset user. */
    usersPassword: vars.USERS_PASSWORD,
    /** `GOOGLE_MAPS_API_KEY` (default empty): written into the seeded store's settings; empty leaves maps off. */
    googleMapsApiKey: vars.GOOGLE_MAPS_API_KEY,
    /** `REQUEST_TIMEOUT_MS` (default `30000`): timeout of one HTTP request. */
    requestTimeoutMs: vars.REQUEST_TIMEOUT_MS,
    /** `VERIFY_SSL` (default `true`): `false` accepts invalid HTTPS certificates, as on a local platform. */
    verifySsl: vars.VERIFY_SSL,
    /** `RUN_DESTRUCTIVE_TESTS` (default `false`): also run tests that change shared data they cannot restore. */
    runDestructiveTests: vars.RUN_DESTRUCTIVE_TESTS,
    /** `API_WORKERS` (default `4`): parallel workers of the `restapi` and `graphql` projects. */
    apiWorkers: vars.API_WORKERS,
    /** `FRONTEND_WORKERS` (default `3`): parallel workers of the `e2e-frontend` project. */
    frontendWorkers: vars.FRONTEND_WORKERS,
    /** `QUANTITY_CONTROL` (default `stepper`): the quantity control the frontend is configured with. */
    quantityControl: vars.QUANTITY_CONTROL,
    /** `RANGE_FILTER_TYPE` (default `slider`): the range filter style the frontend is configured with. */
    rangeFilterType: vars.RANGE_FILTER_TYPE,
    /** `CHECKOUT_MODE` (default `single-page`): the checkout flow the frontend is configured with. */
    checkoutMode: vars.CHECKOUT_MODE,
    /** `SEED_ONLY` (optional): comma-separated dataset collections to seed instead of all. */
    seedOnly: vars.SEED_ONLY,
  }),
);

/**
 * The validated, frozen test configuration; tests get it as the `env` fixture.
 * Passwords and keys are {@link Secret}s. Booleans accept `true`/`false`, `1`/`0`, `yes`/`no`, `on`/`off`,
 * `y`/`n`, `enabled`/`disabled`, in any case.
 */
export type Env = output<typeof EnvSchema>;

let cachedEnv: Env | undefined;

/**
 * Validates raw variables into an {@link Env}. Pure (no file or `process.env` access), for unit tests;
 * elsewhere use {@link getEnv}.
 *
 * @throws Error `"Invalid environment:"` listing every missing or invalid variable.
 */
export function parseEnv(vars: Readonly<Record<string, string | undefined>>): Env {
  return parseOrThrow(EnvSchema, vars, "Invalid environment");
}

/**
 * Returns the run's {@link Env}, parsed once and cached. The first call loads `.env` from the working
 * directory if present; variables already set in the shell or on CI win over it.
 *
 * @throws Error `"Invalid environment:"` listing every missing or invalid variable.
 */
export function getEnv(): Env {
  if (cachedEnv === undefined) {
    if (existsSync(".env")) {
      process.loadEnvFile();
    }
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}
