import type { ApiSession } from "@api/api-session";
import type { App } from "@api/auth/browser-sessions";
import type { CustomerAccount } from "@dataset/arrange";

import { BrowserSessions } from "@api/auth/browser-sessions";
import { TokenClient } from "@api/auth/token-client";
import { TokenManager } from "@api/auth/token-manager";
import { HttpClient } from "@api/http/http-client";
import { PageBuilderShell } from "@pages/backend/page-builder/page-builder";
import { Frontend } from "@pages/frontend/frontend";

import { test as arrangeTest } from "./arrange.fixture";

/** Frontend browser identity: an anonymous visitor, or a new customer account created for the test. */
export type ShopperKind = "anonymous" | "customer";

/** Options of browser projects and tests. */
export interface BrowserOptions {
  /** Set by the Playwright project; decides who the browser is signed in as. `undefined` for API projects. */
  readonly app: App | undefined;
  /**
   * Who the frontend browser is; `"anonymous"` by default.
   *
   * @example
   * test.use({ shopperKind: "customer" });
   */
  readonly shopperKind: ShopperKind;
}

/** The frontend browser's identity on the API, for arranging carts and other data the browser then shows. */
export interface Shopper {
  /** Same identity as the browser: the anonymous visitor (same user id) or the signed-in customer. */
  readonly api: ApiSession;
  /** The customer account; `undefined` for an anonymous shopper. */
  readonly account: CustomerAccount | undefined;
}

/** Fixtures of browser tests. */
export interface BrowserFixtures {
  /** The browser's shopper; their default cart is removed after the test. */
  readonly shopper: Shopper;
  /** Frontend page objects on the test's `page`, built for the frontend's configured controls. */
  readonly frontend: Frontend;
  /** The admin UI's page builder shell on the test's `page`, for the store under test. */
  readonly pageBuilder: PageBuilderShell;
}

interface BrowserWorkerFixtures {
  readonly browserSessions: BrowserSessions;
}

/**
 * Adds {@link BrowserFixtures} on top of `arrange`. The browser starts signed in through `storageState`:
 * on the frontend as the shopper (token or anonymous user id in local storage), on the admin UI as `env.admin`
 * (sign-in cookie).
 */
export const test = arrangeTest.extend<BrowserOptions & BrowserFixtures, BrowserWorkerFixtures>({
  app: [undefined, { option: true }],
  shopperKind: ["anonymous", { option: true }],

  browserSessions: [
    async ({ env, playwright }, use) => {
      const requestOptions = { timeout: env.requestTimeoutMs, ignoreHTTPSErrors: !env.verifySsl };
      const frontendContext = await playwright.request.newContext({ ...requestOptions, baseURL: env.frontendBaseUrl });
      const frontendTokens = new TokenManager(new TokenClient(new HttpClient(frontendContext), env.storeId));
      try {
        await use(
          new BrowserSessions(frontendTokens, {
            frontendBaseUrl: env.frontendBaseUrl,
            newBackendContext: () => playwright.request.newContext({ ...requestOptions, baseURL: env.backendBaseUrl }),
          }),
        );
        await frontendTokens.signOutAll();
      } finally {
        await frontendContext.dispose();
      }
    },
    { scope: "worker" },
  ],

  shopper: async ({ api, arrange, cleanup, browserSessions, shopperKind }, use) => {
    if (shopperKind === "anonymous") {
      arrange.carts.removeDefaultCartLater(api);
      await use({ api, account: undefined });
      return;
    }
    const account = await arrange.customers.customerAccount();
    cleanup.push(`sign ${account.credentials.username} out of the frontend`, () =>
      browserSessions.signOut(account.credentials.username),
    );
    arrange.carts.removeDefaultCartLater(account.api);
    await use({ api: account.api, account });
  },

  storageState: async ({ app, shopper, browserSessions, env }, use) => {
    if (app === "backend") {
      await use(await browserSessions.signedIn("backend", env.admin));
      return;
    }
    if (app === "frontend") {
      await use(
        shopper.account === undefined
          ? browserSessions.anonymous("frontend", (await shopper.api.storeContext()).userId)
          : await browserSessions.signedIn("frontend", shopper.account.credentials),
      );
      return;
    }
    await use(undefined);
  },

  frontend: async ({ page, env }, use) => {
    await use(new Frontend(page, env));
  },

  pageBuilder: async ({ page, env }, use) => {
    await use(new PageBuilderShell(page, { path: env.pageBuilderPath, storeId: env.storeId }));
  },
});
