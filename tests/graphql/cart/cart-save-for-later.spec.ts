import * as allure from "allure-js-commons";

import {
  GetSavedForLaterDocument,
  MoveFromSavedForLaterDocument,
  MoveToSavedForLaterDocument,
} from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";
import { arrangeCart, cartScope, lineItemFor, registerCartRemoval, requireCart } from "@dataset/arrange/cart";
import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { expect, test } from "@fixtures";

const PRODUCT_ID = SEEDED_PRODUCTS.iphone17Black;

test.beforeEach(async () => {
  await allure.feature("Cart / Save For Later");
});

test.describe("save for later (customer account)", () => {
  test("move a line item to saved for later and back", async ({ customerAccount, cleanupStack }) => {
    const { graphqlClient, context } = customerAccount;
    const cart = await test.step("arrange: cart with a product", () =>
      arrangeCart(graphqlClient, cleanupStack, context, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { moveToSavedForLater } = await test.step("act: move the line item to saved for later", () =>
      graphqlClient.execute(MoveToSavedForLaterDocument, {
        command: { ...cartScope(context), cartId: cart.id, lineItemIds: [lineItemFor(cart, PRODUCT_ID).id] },
      }));
    const savedList = requireFields(moveToSavedForLater?.list, ["id"], "Saved for later list");
    registerCartRemoval(graphqlClient, cleanupStack, context, savedList.id);
    await test.step("assert: product left the cart for the saved list", async () => {
      expect(moveToSavedForLater?.cart?.itemsCount).toBe(0);
      expect(savedList.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID })]);
    });

    const { moveFromSavedForLater } = await test.step("act: move the product back to the cart", () =>
      graphqlClient.execute(MoveFromSavedForLaterDocument, {
        command: {
          ...cartScope(context),
          cartId: savedList.id,
          lineItemIds: [lineItemFor(savedList, PRODUCT_ID).id],
        },
      }));
    registerCartRemoval(
      graphqlClient,
      cleanupStack,
      context,
      requireCart(moveFromSavedForLater?.cart, "Cart after moving back").id,
    );
    await test.step("assert: product is back in the cart and the saved list is empty", async () => {
      expect(moveFromSavedForLater?.list?.itemsCount).toBe(0);
      expect(moveFromSavedForLater?.cart?.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID })]);
    });
  });

  test("read the saved-for-later list", async ({ customerAccount, cleanupStack }) => {
    const { graphqlClient, context } = customerAccount;
    const cart = await test.step("arrange: cart with a product", () =>
      arrangeCart(graphqlClient, cleanupStack, context, [{ productId: PRODUCT_ID, quantity: 1 }]));
    await test.step("arrange: move the line item to saved for later", async () => {
      const { moveToSavedForLater } = await graphqlClient.execute(MoveToSavedForLaterDocument, {
        command: { ...cartScope(context), cartId: cart.id, lineItemIds: [lineItemFor(cart, PRODUCT_ID).id] },
      });
      registerCartRemoval(
        graphqlClient,
        cleanupStack,
        context,
        requireCart(moveToSavedForLater?.list, "Saved list").id,
      );
    });

    const { getSavedForLater } = await test.step("act: get the saved-for-later list", () =>
      graphqlClient.execute(GetSavedForLaterDocument, cartScope(context)));

    await test.step("assert: the list holds exactly the saved product", async () => {
      expect(getSavedForLater).toMatchObject({ customerId: customerAccount.userId, itemsQuantity: 1 });
      expect(getSavedForLater?.items).toEqual([expect.objectContaining({ productId: PRODUCT_ID, quantity: 1 })]);
    });
  });
});
