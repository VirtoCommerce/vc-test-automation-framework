import type { Env } from "@core/env";

import { getEnv } from "@core/env";

/** Values for the `${ENV:…}` placeholders in the data, by key. */
export type EnvPlaceholders = Readonly<Record<string, string>>;

/**
 * Returns the values the data takes from the environment: store id, frontend URL, dataset users' password and
 * Google Maps key. Secrets are revealed here, since they go into seed requests.
 *
 * @param env - This run's by default.
 */
export function envPlaceholders(env: Env = getEnv()): EnvPlaceholders {
  return {
    STORE_ID: env.storeId,
    FRONTEND_BASE_URL: env.frontendBaseUrl,
    USERS_PASSWORD: env.usersPassword.reveal(),
    GOOGLE_MAPS_API_KEY: env.googleMapsApiKey.reveal(),
  };
}
