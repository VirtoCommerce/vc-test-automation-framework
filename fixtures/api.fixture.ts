import type { ApiConnection } from "@api/api-session";
import type { InstalledModules, ModuleRequirement } from "@core/modules";

import { ApiSession } from "@api/api-session";
import { TokenClient } from "@api/auth/token-client";
import { TokenManager } from "@api/auth/token-manager";
import { HttpClient } from "@api/http/http-client";
import { Logger } from "@core/logger";
import { unmetReasons } from "@core/modules";
import { credentialsOf } from "@dataset/users";

import { test as datasetTest } from "./dataset.fixture";
import { loadInstalledModules } from "./installed-modules";

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
   * Option: platform modules the tests need, from `MODULES` (`@dataset/modules`), with their version ranges. A test
   * whose module is not installed or not in its range is skipped, with the reason. Empty (the default) checks
   * nothing.
   *
   * @example
   * test.use({ requiresModules: [MODULES.pageBuilder] });
   */
  readonly requiresModules: readonly ModuleRequirement[];
  /**
   * API session of `user`, signed in before the test. Use `api.rest`, `api.graphql`, and `api.as(otherUser)`
   * or `api.anonymous()` for another identity.
   */
  readonly api: ApiSession;
  /** Skips the test when a module of `requiresModules` is not installed or not in its range; runs for every test. */
  readonly _requiredModules: undefined;
}

interface ApiWorkerFixtures {
  readonly _connection: ApiConnection;
  /** The installed platform modules the `modules` setup project saved for this run; loaded on first call. */
  readonly _installedModules: () => Promise<InstalledModules>;
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
    async ({}, use) => {
      let installed: Promise<InstalledModules> | undefined;
      await use(() => {
        installed ??= loadInstalledModules();
        return installed;
      });
    },
    { scope: "worker" },
  ],

  user: [undefined, { option: true }],

  requiresModules: [[], { option: true }],

  _requiredModules: [
    async ({ requiresModules, _installedModules }, use, testInfo) => {
      const unmet = requiresModules.length === 0 ? [] : unmetReasons(requiresModules, await _installedModules());
      if (unmet.length > 0) {
        new Logger("modules").warn(`skipped "${testInfo.titlePath.slice(1).join(" › ")}": ${unmet.join("; ")}`);
      }
      testInfo.skip(unmet.length > 0, unmet.join("; "));
      await use(undefined);
    },
    { auto: true },
  ],

  api: async ({ _connection, dataset, user }, use) => {
    await use(await ApiSession.open(_connection, (userName) => credentialsOf(dataset, userName), user));
  },
});
