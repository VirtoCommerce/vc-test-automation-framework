import type { ApiConnection } from "@api/api-session";

import { ApiSession } from "@api/api-session";
import { TokenClient } from "@api/auth/token-client";
import { TokenManager } from "@api/auth/token-manager";
import { HttpClient } from "@api/http/http-client";
import { credentialsOf } from "@dataset/users";

import { test as datasetTest } from "./dataset.fixture";

/** The API identity and session of a test. */
export interface ApiFixtures {
  /**
   * Option: the dataset user name the `api` session signs in as; anonymous when `undefined` (the default).
   *
   * @example
   * test.use({ user: "acme_store_administrator@acme.com" });
   */
  readonly user: string | undefined;
  /**
   * API session of `user`, signed in before the test. Use `api.rest`, `api.graphql`, and `api.as(otherUser)`
   * or `api.anonymous()` for another identity.
   */
  readonly api: ApiSession;
}

interface ApiWorkerFixtures {
  readonly _connection: ApiConnection;
}

/** Adds {@link ApiFixtures} on top of the dataset fixtures; one request context per worker, signed out at its end. */
export const test = datasetTest.extend<ApiFixtures, ApiWorkerFixtures>({
  _connection: [
    async ({ env, store, playwright }, use) => {
      const context = await playwright.request.newContext({
        baseURL: env.backendBaseUrl,
        timeout: env.requestTimeoutMs,
        ignoreHTTPSErrors: !env.verifySsl,
      });
      const tokens = new TokenManager(new TokenClient(new HttpClient(context), env.storeId));
      try {
        await use({
          context,
          tokens,
          store: { storeId: store.id, cultureName: store.defaultLanguage, currencyCode: store.defaultCurrency },
        });
        await tokens.signOutAll();
      } finally {
        await context.dispose();
      }
    },
    { scope: "worker" },
  ],

  user: [undefined, { option: true }],

  api: async ({ _connection, dataset, user }, use) => {
    await use(await ApiSession.open(_connection, (userName) => credentialsOf(dataset, userName), user));
  },
});
