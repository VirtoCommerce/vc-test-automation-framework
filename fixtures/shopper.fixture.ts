import type { Shopper } from "./browser.fixture";

import { mergeTests } from "@playwright/test";

import { browserShopper, test as browserTest } from "./browser.fixture";
import { test as frontendContextTest } from "./frontend-context.fixture";

export type { Shopper } from "./browser.fixture";

export interface ShopperFixtures {
  readonly shopper: Shopper;
}

export const test = mergeTests(browserTest, frontendContextTest).extend<ShopperFixtures>({
  shopper: async (
    { browserCustomerAccount, user, anonymousUserId, anonymousHttpClient, tokenManager, dataset, env },
    use,
  ) => {
    await use(
      await browserShopper({
        browserCustomerAccount,
        user,
        anonymousUserId,
        anonymousHttpClient,
        tokenManager,
        dataset,
        env,
      }),
    );
  },
});
