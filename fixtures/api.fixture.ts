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
   * Option: platform modules the tests need, such as `VirtoCommerce.WhiteLabeling`. A test whose module is not
   * installed is skipped, naming it. Empty (the default) checks nothing.
   *
   * @example
   * test.use({ requiresModules: ["VirtoCommerce.WhiteLabeling"] });
   */
  readonly requiresModules: readonly string[];
  /**
   * API session of `user`, signed in before the test. Use `api.rest`, `api.graphql`, and `api.as(otherUser)`
   * or `api.anonymous()` for another identity.
   */
  readonly api: ApiSession;
  /** Skips the test when a module of `requiresModules` is not installed; runs for every test. */
  readonly _requiredModules: undefined;
}

interface ApiWorkerFixtures {
  readonly _connection: ApiConnection;
  /** Ids of the installed platform modules, read once per worker as the platform administrator on first call. */
  readonly _installedModules: () => Promise<ReadonlySet<string>>;
}

/**
 * Returns the modules of `required` that are not in `installed`, in the given order.
 *
 * @example
 * missingModules(["VirtoCommerce.WhiteLabeling"], new Set(["VirtoCommerce.Core"])); // ["VirtoCommerce.WhiteLabeling"]
 */
export function missingModules(required: readonly string[], installed: ReadonlySet<string>): string[] {
  return required.filter((moduleId) => !installed.has(moduleId));
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

  _installedModules: [
    async ({ _connection, dataset, env }, use) => {
      let installed: Promise<ReadonlySet<string>> | undefined;
      async function read(): Promise<ReadonlySet<string>> {
        const admin = await ApiSession.open(_connection, (userName) => credentialsOf(dataset, userName), env.admin);
        return admin.rest.modules.getInstalledIds();
      }
      await use(() => {
        installed ??= read();
        return installed;
      });
    },
    { scope: "worker" },
  ],

  user: [undefined, { option: true }],

  requiresModules: [[], { option: true }],

  _requiredModules: [
    async ({ requiresModules, _installedModules }, use, testInfo) => {
      const missing = requiresModules.length === 0 ? [] : missingModules(requiresModules, await _installedModules());
      testInfo.skip(missing.length > 0, `Not installed: ${missing.join(", ")}`);
      await use(undefined);
    },
    { auto: true },
  ],

  api: async ({ _connection, dataset, user }, use) => {
    await use(await ApiSession.open(_connection, (userName) => credentialsOf(dataset, userName), user));
  },
});
