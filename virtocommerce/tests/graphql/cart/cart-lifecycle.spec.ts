import { expect, test } from "@fixtures";
import { ClearCartDocument, GetCartDocument } from "@graphql/generated/graphql.ts";
import { uniqueId } from "@support/unique-id.ts";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-mist-blue";

test.describe("cart lifecycle (anonymous)", () => {
  test("a cart that was never created is null", async ({ shopper }) => {
    const cartName = uniqueId("test-missing-cart");

    const { cart } = await test.step(`act: get cart ${cartName}`, async () =>
      shopper.graphql.execute(GetCartDocument, { ...shopper.storeContext, cartName }));

    await test.step("assert: there is no cart", () => {
      expect(cart).toBeNull();
    });
  });

  test("clear a cart", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 3 }]));

    const { clearCart } = await test.step("act: clear the cart", async () =>
      shopper.graphql.execute(ClearCartDocument, { command: { ...shopper.storeContext, cartId: cart.id } }));

    await test.step("assert: the cart is empty", () => {
      expect(clearCart).toMatchObject({ id: cart.id, itemsCount: 0, items: [] });
    });
  });
});

for (const { shopperAs, isAnonymous } of [
  { shopperAs: "anonymous", isAnonymous: true },
  { shopperAs: "customer", isAnonymous: false },
] as const) {
  test.describe(`cart lifecycle (${shopperAs})`, () => {
    test.use({ shopperAs });

    test("get the own cart by id", async ({ shopper, arrange }) => {
      const cart = await test.step("arrange: cart with a product", () =>
        arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 1 }]));
      const context = shopper.storeContext;

      const { cart: found } = await test.step(`act: get cart ${cart.id}`, () =>
        shopper.graphql.execute(GetCartDocument, { ...context, cartId: cart.id }));

      await test.step("assert: the own cart with its product is returned", () => {
        expect(found).toMatchObject({ id: cart.id, isAnonymous, customerId: context.userId });
        expect(found?.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID, quantity: 1 })]);
      });
    });
  });
}
