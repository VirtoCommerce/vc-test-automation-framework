import type { TestFixture } from "@playwright/test";
import type { ArrangedCart, CartItem } from "@dataset/arrange/cart";
import type { ShopperFixtures } from "./shopper.fixture";

import { expect } from "@playwright/test";

import { addToDefaultCart, findDefaultCart } from "@dataset/arrange/cart";
import { describeShopper } from "@dataset/frontend-context";

import { test as base } from "./shopper.fixture";

export interface CartFixtures {
  readonly cart: ArrangedCart | undefined;
}

export const test = base.extend<CartFixtures>({
  cart: [
    async ({}, use) => {
      await use(undefined);
    },
    { auto: true },
  ],
});

export function withItems(items: readonly CartItem[]): TestFixture<ArrangedCart | undefined, ShopperFixtures> {
  return async ({ shopper }, use) => {
    const cart = await addToDefaultCart(shopper.graphqlClient, shopper.context, items);
    await expect
      .poll(async () => (await findDefaultCart(shopper.graphqlClient, shopper.context))?.itemsCount, {
        message: `the default cart of ${describeShopper(shopper.context)} is readable`,
      })
      .toBe(cart.itemsCount);
    await use(cart);
  };
}
