import { expect, test } from "@fixtures";
import {
  GetSavedForLaterDocument,
  MoveFromSavedForLaterDocument,
  MoveToSavedForLaterDocument,
} from "@graphql/generated/graphql.ts";
import { lineItemOf } from "@graphql/line-items.ts";
import { requireFields } from "@support/require-fields.ts";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";

test.describe("save for later (customer of their own)", () => {
  test.use({ shopperAs: "customer" });

  test("move a line item to saved for later, read the list and move it back", async ({ shopper, arrange }) => {
    const context = shopper.storeContext;
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { moveToSavedForLater } = await test.step("act: move the line item to saved for later", () =>
      shopper.graphql.execute(MoveToSavedForLaterDocument, {
        command: { ...context, cartId: cart.id, lineItemIds: [lineItemOf(cart, PRODUCT_ID).id] },
      }));
    const savedList = requireFields(moveToSavedForLater?.list, ["id"], "Saved for later list");
    arrange.carts.removeCartLater(shopper, savedList.id);
    await test.step("assert: the product left the cart for the saved list", () => {
      expect(moveToSavedForLater?.cart?.itemsCount).toBe(0);
      expect(savedList.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID })]);
    });

    const { getSavedForLater } = await test.step("act: read the saved-for-later list", () =>
      shopper.graphql.execute(GetSavedForLaterDocument, context));
    await test.step("assert: the list belongs to the customer and holds exactly the saved product", () => {
      expect(getSavedForLater).toMatchObject({ id: savedList.id, customerId: shopper.userId, itemsQuantity: 1 });
      expect(getSavedForLater?.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID, quantity: 1 })]);
    });

    const { moveFromSavedForLater } = await test.step("act: move the product back to the cart", () =>
      shopper.graphql.execute(MoveFromSavedForLaterDocument, {
        command: { ...context, cartId: savedList.id, lineItemIds: [lineItemOf(savedList, PRODUCT_ID).id] },
      }));
    await test.step("assert: the product is back in the cart and the saved list is empty", () => {
      expect(moveFromSavedForLater?.list?.itemsCount).toBe(0);
      expect(moveFromSavedForLater?.cart?.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID })]);
    });
  });
});
