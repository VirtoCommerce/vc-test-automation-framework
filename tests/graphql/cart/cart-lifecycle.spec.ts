import * as allure from "allure-js-commons";

import { ClearCartDocument, GetCartDocument } from "@api/graphql/generated/graphql";
import { uniqueId } from "@core/unique-id";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-mist-blue";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Lifecycle");
});

test.describe("cart lifecycle (anonymous)", () => {
  test("a cart that was never created is null", async ({ api }) => {
    await allure.story("Get cart");
    await allure.description("Asking for a cart name nobody used returns no cart instead of creating one.");
    const cartName = uniqueId("test-missing-cart");

    const { cart } = await test.step(`act: get cart ${cartName}`, async () =>
      api.graphql.execute(GetCartDocument, { ...(await api.storeContext()), cartName }));

    await test.step("assert: there is no cart", () => {
      expect(cart).toBeNull();
    });
  });

  test("clear a cart", async ({ api, arrange }) => {
    await allure.story("Clear cart");
    await allure.description("Clearing a cart removes every line item and leaves the cart itself.");
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 3 }]));

    const { clearCart } = await test.step("act: clear the cart", async () =>
      api.graphql.execute(ClearCartDocument, { command: { ...(await api.storeContext()), cartId: cart.id } }));

    await test.step("assert: the cart is empty", () => {
      expect(clearCart).toMatchObject({ id: cart.id, itemsCount: 0, items: [] });
    });
  });
});

for (const { shopper, user, isAnonymous } of [
  { shopper: "anonymous", user: undefined, isAnonymous: true },
  { shopper: "signed-in customer", user: "acme_store_employee_1@acme.com", isAnonymous: false },
] as const) {
  test.describe(`cart lifecycle (${shopper})`, () => {
    test.use({ user });

    test("get the own cart by id", async ({ api, arrange }) => {
      await allure.story("Get cart");
      await allure.description("A shopper reads their own cart back by id, with its items.");
      const cart = await test.step("arrange: cart with a product", () =>
        arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 1 }]));
      const context = await api.storeContext();

      const { cart: found } = await test.step(`act: get cart ${cart.id}`, () =>
        api.graphql.execute(GetCartDocument, { ...context, cartId: cart.id }));

      await test.step("assert: the own cart with its product is returned", () => {
        expect(found).toMatchObject({ id: cart.id, isAnonymous, customerId: context.userId });
        expect(found?.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID, quantity: 1 })]);
      });
    });
  });
}
