import * as allure from "allure-js-commons";

import {
  GetSavedForLaterDocument,
  MoveFromSavedForLaterDocument,
  MoveToSavedForLaterDocument,
} from "@api/graphql/generated/graphql";
import { lineItemOf } from "@api/graphql/line-items";
import { requireFields } from "@core/required-fields";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Save For Later");
});

test.describe("save for later (customer of their own)", () => {
  test("move a line item to saved for later, read the list and move it back", async ({ arrange }) => {
    await allure.story("Saved for later");
    await allure.description(
      "A line item saved for later leaves the cart for the customer's saved list, is readable there, " +
        "and returns to the cart. The customer is created for the test: each customer has one saved list.",
    );
    const customer = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const context = await customer.api.storeContext();
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(customer.api, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { moveToSavedForLater } = await test.step("act: move the line item to saved for later", () =>
      customer.api.graphql.execute(MoveToSavedForLaterDocument, {
        command: { ...context, cartId: cart.id, lineItemIds: [lineItemOf(cart, PRODUCT_ID).id] },
      }));
    const savedList = requireFields(moveToSavedForLater?.list, ["id"], "Saved for later list");
    await arrange.carts.removeCartLater(customer.api, savedList.id);
    await test.step("assert: the product left the cart for the saved list", () => {
      expect(moveToSavedForLater?.cart?.itemsCount).toBe(0);
      expect(savedList.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID })]);
    });

    const { getSavedForLater } = await test.step("act: read the saved-for-later list", () =>
      customer.api.graphql.execute(GetSavedForLaterDocument, context));
    await test.step("assert: the list belongs to the customer and holds exactly the saved product", () => {
      expect(getSavedForLater).toMatchObject({ id: savedList.id, customerId: customer.userId, itemsQuantity: 1 });
      expect(getSavedForLater?.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID, quantity: 1 })]);
    });

    const { moveFromSavedForLater } = await test.step("act: move the product back to the cart", () =>
      customer.api.graphql.execute(MoveFromSavedForLaterDocument, {
        command: { ...context, cartId: savedList.id, lineItemIds: [lineItemOf(savedList, PRODUCT_ID).id] },
      }));
    await arrange.carts.removeCartLater(
      customer.api,
      requireFields(moveFromSavedForLater?.cart, ["id"], "Cart after moving back").id,
    );
    await test.step("assert: the product is back in the cart and the saved list is empty", () => {
      expect(moveFromSavedForLater?.list?.itemsCount).toBe(0);
      expect(moveFromSavedForLater?.cart?.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID })]);
    });
  });
});
