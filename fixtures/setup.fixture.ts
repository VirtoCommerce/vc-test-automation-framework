import { ApiSession } from "@api/api-session";
import { TokenClient } from "@api/auth/token-client";
import { TokenManager } from "@api/auth/token-manager";
import { HttpClient } from "@api/http/http-client";
import { credentialsOf } from "@dataset/users";

import { test as datasetTest } from "./dataset.fixture";

/** Fixtures of the setup projects, which run before the dataset exists. */
export interface SetupFixtures {
  /**
   * Session of the platform administrator from the environment (`ADMIN_USERNAME`), over a request context of the
   * test, so its trace records every call; signed out after the test.
   */
  readonly platformAdmin: ApiSession;
}

/** Adds {@link SetupFixtures} on top of the dataset fixtures; signs in only the platform administrator. */
export const test = datasetTest.extend<SetupFixtures>({
  platformAdmin: async ({ playwright, env, dataset, store }, use) => {
    const context = await playwright.request.newContext({
      baseURL: env.backendBaseUrl,
      timeout: env.requestTimeoutMs,
      ignoreHTTPSErrors: !env.verifySsl,
    });
    const tokens = new TokenManager(new TokenClient(new HttpClient(context), env.storeId));
    try {
      const connection = {
        context,
        tokens,
        store: { storeId: store.id, cultureName: store.defaultLanguage, currencyCode: store.defaultCurrency },
      };
      await use(await ApiSession.open(connection, (userName) => credentialsOf(dataset, userName), env.admin));
      await tokens.signOutAll();
    } finally {
      await context.dispose();
    }
  },
});
