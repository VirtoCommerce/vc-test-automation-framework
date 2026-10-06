import * as allure from "allure-js-commons";

import { ClearCartDocument, GetCartDocument } from "@api/graphql/generated/graphql";
import { uniqueId } from "@core/unique-id";
import { arrangeCart, cartScope } from "@dataset/arrange/cart";
import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { expect, test } from "@fixtures";

const PRODUCT_ID = SEEDED_PRODUCTS.iphone17MistBlue;

test.beforeEach(async () => {
  await allure.feature("Cart / Lifecycle");
});

test.describe("cart lifecycle (anonymous)", () => {
  test("a cart that was never created is null", async ({ graphqlClient, frontendContext }) => {
    const cartName = uniqueId("test-missing-cart");

    const { cart } = await test.step(`act: get cart ${cartName}`, () =>
      graphqlClient.execute(GetCartDocument, { ...cartScope(frontendContext), cartName }));

    await test.step("assert: there is no cart", async () => {
      expect(cart).toBeNull();
    });
  });

  test("get the cart of an anonymous user", async ({ graphqlClient, cleanupStack, frontendContext }) => {
    const arranged = await test.step("arrange: cart with a product", () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { cart } = await test.step(`act: get cart ${arranged.id}`, () =>
      graphqlClient.execute(GetCartDocument, { ...cartScope(frontendContext), cartId: arranged.id }));

    await test.step("assert: the anonymous user's cart with its product is returned", async () => {
      expect(cart).toMatchObject({ id: arranged.id, isAnonymous: true, customerId: frontendContext.userId });
      expect(cart?.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID, quantity: 1 })]);
    });
  });

  test("clear a cart", async ({ graphqlClient, cleanupStack, frontendContext }) => {
    const cart = await test.step("arrange: cart with a product", () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [{ productId: PRODUCT_ID, quantity: 3 }]));

    const { clearCart } = await test.step("act: clear cart", () =>
      graphqlClient.execute(ClearCartDocument, { command: { ...cartScope(frontendContext), cartId: cart.id } }));

    await test.step("assert: cart is empty", async () => {
      expect(clearCart).toMatchObject({ id: cart.id, itemsCount: 0, items: [] });
    });
  });
});

test.describe("cart lifecycle (customer account)", () => {
  test("get the cart of a signed-in customer", async ({ customerAccount, cleanupStack }) => {
    const { graphqlClient, context, userId } = customerAccount;
    const arranged = await test.step("arrange: cart with a product", () =>
      arrangeCart(graphqlClient, cleanupStack, context, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { cart } = await test.step(`act: get cart ${arranged.id}`, () =>
      graphqlClient.execute(GetCartDocument, { ...cartScope(context), cartId: arranged.id }));

    await test.step("assert: the customer's cart with its product is returned", async () => {
      expect(cart).toMatchObject({ id: arranged.id, isAnonymous: false, customerId: userId });
      expect(cart?.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID, quantity: 1 })]);
    });
  });
});
