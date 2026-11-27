import type { Credentials } from "@virtocommerce/test-automation-framework/auth";
import type { DefaultFixtures, DefaultWorkerFixtures } from "@virtocommerce/test-automation-framework/fixtures";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { Arrange, Shopper } from "../arrange/index.ts";
import type { SuiteEnv } from "../env.ts";
import type { StoreUnderTest } from "../support/store-under-test.ts";

import { randomUUID } from "node:crypto";

import { PageBuilderShell } from "@pages/backend/page-builder/page-builder-shell.ts";
import { PageDesigner } from "@pages/backend/page-designer/page-designer.ts";
import { Frontend } from "@pages/frontend/frontend.ts";
import { test as base } from "@playwright/test";
import { anonymousVisitorState } from "@virtocommerce/test-automation-framework/auth";
import { defaultFixtures } from "@virtocommerce/test-automation-framework/fixtures";
import { GraphqlClient } from "@virtocommerce/test-automation-framework/graphql";

import { createArrange, shopperOf, signedInShopper } from "../arrange/index.ts";
import { dataset } from "../dataset/index.ts";
import { ADMINISTRATOR, STORE_ADMINISTRATOR } from "../dataset/users.ts";
import { env } from "../env.ts";
import { findStoreUnderTest } from "../support/store-under-test.ts";

export type { Arrange, CartItem, Customer, Shopper, StoreContext } from "../arrange/index.ts";

/** The app that a browser test opens, signed in. */
export type App = "frontend" | "backend";

/**
 * Who the frontend browser is: an anonymous visitor, a customer created for the test, or a dataset user, such as an
 * organization maintainer.
 */
export type ShopperAs = "anonymous" | "customer" | Credentials;

/** The fixtures of the test suite that one worker shares between its tests. */
export interface SuiteWorkerFixtures {
  /** The Virto Commerce dataset, as seeded. */
  readonly dataset: typeof dataset;
  /**
   * The store that the frontend (`FRONTEND_BASE_URL`) serves, as the platform has it, with its catalog, default language
   * and default currency. Tests fail when no store serves the frontend.
   */
  readonly store: StoreUnderTest;
}

/** The fixtures of the test suite for one test. */
export interface SuiteFixtures {
  /** The app that the browser starts signed in to, set by the project. `undefined` for API projects. */
  readonly app: App | undefined;
  /**
   * The user that `api`, `graphql` and the admin UI act as, set with `test.use`, such as `STORE_ADMINISTRATOR`.
   * Anonymous when `undefined`, the default; the admin UI then signs in as `ADMINISTRATOR`.
   */
  readonly user: Credentials | undefined;
  /**
   * Who `shopper` is, set with `test.use`: `"anonymous"`, the default, `"customer"` for a customer created for the
   * test, or the credentials of a dataset user.
   */
  readonly shopperAs: ShopperAs;
  /** A client of the platform that acts as `user`. */
  readonly api: HttpClient;
  /** Creates test data and removes it after the test. */
  readonly arrange: Arrange;
  /**
   * The frontend user that the browser is, on the API: an anonymous visitor, a customer that `arrange` created, or a
   * dataset user. The default cart of a signed-in shopper is removed after the test; an anonymous visitor's after a
   * frontend test.
   */
  readonly shopper: Shopper;
  /** The frontend page objects on the test's page, built for the frontend's settings. */
  readonly frontend: Frontend;
  /** The page builder app of the admin UI on the test's page, for the store under test. */
  readonly pageBuilder: PageBuilderShell;
  /**
   * The page designer of the admin UI on the test's page, for the store under test. The browser may read and write
   * the clipboard, which the designer uses to copy and paste sections.
   */
  readonly pageDesigner: PageDesigner;
}

/**
 * The Playwright `test` of the Virto Commerce test suite, with the default fixtures of the framework and the fixtures
 * of the suite.
 *
 * @remarks
 * - `test.use` sets who acts: `modules`, `user` and `shopperAs`. Tests arrange their data in `arrange:` steps with
 *   `arrange`, which removes it after the test.
 * - `graphql` acts as `user`, unlike the anonymous `graphql` of the framework.
 * - On the frontend, the browser starts as `shopper`. In the admin UI, it starts as `user`, or as `ADMINISTRATOR`
 *   when `user` is anonymous.
 * - The browser sign-in is applied to `context`, not through the `storageState` option. Playwright sets fixtures that
 *   `storageState` depends on up before the trace starts, so their requests would be missing from the trace.
 *
 * @example
 * import { expect, test } from "@fixtures";
 *
 * const PHONE = "product-smartphone-samsung-galaxy-a57-5g";
 *
 * test.use({ shopperAs: "customer" });
 *
 * test("the cart shows the line item", async ({ arrange, shopper, frontend }) => {
 *   await test.step("arrange: a cart", () => arrange.carts.checkoutReadyCart(shopper, [{ productId: PHONE, quantity: 2 }]));
 *   const cart = frontend.cart();
 *   await cart.navigate();
 *   await expect(cart.lineItems).toHaveCount(1);
 * });
 */
export const test = base
  .extend<DefaultFixtures, DefaultWorkerFixtures<SuiteEnv>>(defaultFixtures(env))
  .extend<SuiteFixtures, SuiteWorkerFixtures>({
    dataset: [async ({}, use) => use(dataset), { scope: "worker", box: true }],

    store: [
      async ({ env, workerAdmin }, use) => use(await findStoreUnderTest(workerAdmin, env.FRONTEND_BASE_URL)),
      { scope: "worker", title: "read the store under test" },
    ],

    app: [undefined, { option: true }],

    user: [undefined, { option: true }],

    shopperAs: ["anonymous", { option: true }],

    api: async ({ user, http, signIn }, use) => {
      await use(user === undefined ? http : await signIn(user));
    },

    graphql: async ({ api }, use) => {
      await use(new GraphqlClient(api));
    },

    arrange: async ({ signIn, store, tokens, frontendSessions, platformSessions }, use) => {
      let admin: Promise<HttpClient> | undefined;
      const { arrange, cleanUp } = createArrange({
        admin: () => {
          admin ??= signIn(STORE_ADMINISTRATOR);
          return admin;
        },
        signIn,
        signOut: async (credentials) => {
          await tokens.signOut(credentials);
          await frontendSessions.signOut(credentials);
          await platformSessions.signOut(credentials);
        },
        store,
      });
      await use(arrange);
      await cleanUp();
    },

    shopper: async ({ shopperAs, app, arrange, http, signIn, store }, use) => {
      if (shopperAs === "customer") {
        await use(await arrange.customers.customer());
        return;
      }
      if (shopperAs !== "anonymous") {
        const datasetUser = await signedInShopper(signIn, store, shopperAs);
        arrange.carts.removeDefaultCartLater(datasetUser);
        await use(datasetUser);
        return;
      }
      const visitor = shopperOf(http, store, randomUUID());
      if (app === "frontend") {
        arrange.carts.removeDefaultCartLater(visitor);
      }
      await use(visitor);
    },

    context: async ({ context, app, env, user, shopper, frontendSessions, platformSessions }, use) => {
      if (app === "frontend") {
        await context.setStorageState(
          shopper.credentials === undefined
            ? anonymousVisitorState(env.FRONTEND_BASE_URL, shopper.userId)
            : await frontendSessions.signedIn(env.FRONTEND_BASE_URL, shopper.credentials),
        );
      }
      if (app === "backend") {
        await context.setStorageState(await platformSessions.signedIn(env.BACKEND_BASE_URL, user ?? ADMINISTRATOR));
      }
      await use(context);
    },

    frontend: async ({ page, env }, use) => {
      await use(
        new Frontend(page, {
          quantityControl: env.QUANTITY_CONTROL,
          rangeFilterType: env.RANGE_FILTER_TYPE,
          checkoutMode: env.CHECKOUT_MODE,
        }),
      );
    },

    pageBuilder: async ({ page, env, store }, use) => {
      await use(new PageBuilderShell(page, { path: env.PAGE_BUILDER_PATH, storeId: store.id }));
    },

    pageDesigner: async ({ page, context, env, store }, use) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: env.BACKEND_BASE_URL });
      await use(new PageDesigner(page, { storeId: store.id }));
    },
  });

export { expect } from "./expect.ts";
