import type { Credentials } from "@virtocommerce/test-automation-framework/auth";
import type { DefaultFixtures, DefaultWorkerFixtures } from "@virtocommerce/test-automation-framework/fixtures";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { Arrange } from "../arrange/index.ts";
import type { SuiteEnv } from "../env.ts";
import type { Shopper } from "../support/shopper.ts";
import type { StoreUnderTest } from "../support/store.ts";

import { randomUUID } from "node:crypto";

import { test as base } from "@playwright/test";
import { anonymousVisitorState } from "@virtocommerce/test-automation-framework/auth";
import { defaultFixtures } from "@virtocommerce/test-automation-framework/fixtures";
import { GraphqlClient } from "@virtocommerce/test-automation-framework/graphql";

import { createArrange } from "../arrange/index.ts";
import { env } from "../env.ts";
import { shopperOf } from "../support/shopper.ts";
import { readStore } from "../support/store.ts";
import { ADMINISTRATOR } from "../support/users.ts";

export type { Arrange } from "../arrange/index.ts";
export type { Shopper, StoreContext } from "../support/shopper.ts";

/** The app that a browser test opens. */
export type App = "frontend";

/** The fixtures of the test suite that one worker shares between its tests. */
export interface SuiteWorkerFixtures {
  /** The store under test (`STORE_ID`), as the platform has it, with its catalog, language and currency. */
  readonly store: StoreUnderTest;
}

/** The fixtures of the test suite for one test. */
export interface SuiteFixtures {
  /** The app that the browser opens, set by the project. `undefined` for API projects. */
  readonly app: App | undefined;
  /** The user that `api` and `graphql` act as, set with `test.use`. Anonymous when `undefined`, the default. */
  readonly user: Credentials | undefined;
  /** A client of the platform that acts as `user`. */
  readonly api: HttpClient;
  /** Creates test data and removes it after the test. */
  readonly arrange: Arrange;
  /** An anonymous visitor of the store under test, on the API; the frontend browser starts as this visitor. */
  readonly shopper: Shopper;
}

/**
 * The Playwright `test` of the test suite, with the default fixtures of the framework and the fixtures of the suite.
 *
 * @remarks
 * - `test.use` sets who acts: `user` and `modules`. Tests arrange their data in `arrange:` steps with `arrange`,
 *   which removes it after the test.
 * - `graphql` acts as `user`, unlike the anonymous `graphql` of the framework.
 * - The browser sign-in is applied to `context`, not through the `storageState` option, so the requests of the
 *   fixtures it depends on appear in the trace.
 */
export const test = base
  .extend<DefaultFixtures, DefaultWorkerFixtures<SuiteEnv>>(defaultFixtures(env))
  .extend<SuiteFixtures, SuiteWorkerFixtures>({
    store: [
      async ({ env, workerAdmin }, use) => use(await readStore(workerAdmin, env.STORE_ID)),
      { scope: "worker", title: "read the store under test" },
    ],

    app: [undefined, { option: true }],

    user: [undefined, { option: true }],

    api: async ({ user, http, signIn }, use) => {
      await use(user === undefined ? http : await signIn(user));
    },

    graphql: async ({ api }, use) => {
      await use(new GraphqlClient(api));
    },

    arrange: async ({ signIn, store }, use) => {
      const { arrange, cleanUp } = createArrange({ admin: () => signIn(ADMINISTRATOR), signIn, store });
      await use(arrange);
      await cleanUp();
    },

    shopper: async ({ http, store }, use) => {
      await use(shopperOf(http, store, randomUUID()));
    },

    context: async ({ context, app, env, shopper }, use) => {
      if (app === "frontend") {
        await context.setStorageState(anonymousVisitorState(env.FRONTEND_BASE_URL, shopper.userId));
      }
      await use(context);
    },
  });

export { expect } from "@playwright/test";
