import * as allure from "allure-js-commons";

import {
  SelectCartItemsDocument,
  UnSelectAllCartItemsDocument,
  UnSelectCartItemsDocument,
} from "@api/graphql/generated/graphql";
import { lineItemOf } from "@api/graphql/line-items";
import { expect, test } from "@fixtures";

const PRODUCT_IDS = [
  "product-smartphone-apple-iphone-17-256gb-black",
  "product-smartphone-apple-iphone-17-256gb-mist-blue",
] as const;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Item Selection");
});

test.describe("cart item selection (anonymous)", () => {
  test("unselect one line item for checkout", async ({ api, arrange }) => {
    await allure.story("Select items");
    await allure.description("Every line item starts selected; unselecting one leaves the others selected.");
    const cart = await test.step("arrange: cart with two products", () =>
      arrange.carts.cart(
        api,
        PRODUCT_IDS.map((productId) => ({ productId, quantity: 1 })),
      ));
    await test.step("assert: every line item is selected by default", () => {
      expect(cart.items?.map((item) => item?.selectedForCheckout)).toEqual([true, true]);
    });
    const unselected = lineItemOf(cart, PRODUCT_IDS[0]);
    const remaining = lineItemOf(cart, PRODUCT_IDS[1]);

    const { unSelectCartItems } = await test.step("act: unselect the first line item", async () =>
      api.graphql.execute(UnSelectCartItemsDocument, {
        command: { ...(await api.storeContext()), cartId: cart.id, lineItemIds: [unselected.id] },
      }));

    await test.step("assert: only the first line item is unselected", () => {
      expect(unSelectCartItems?.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: unselected.id, selectedForCheckout: false }),
          expect.objectContaining({ id: remaining.id, selectedForCheckout: true }),
        ]),
      );
    });
  });

  test("select one line item after unselecting all", async ({ api, arrange }) => {
    await allure.story("Select items");
    await allure.description("After unselecting every line item, selecting one selects only that one.");
    const cart = await test.step("arrange: cart with two products", () =>
      arrange.carts.cart(
        api,
        PRODUCT_IDS.map((productId) => ({ productId, quantity: 1 })),
      ));
    const context = await api.storeContext();
    const { unSelectAllCartItems } = await test.step("arrange: unselect every line item", () =>
      api.graphql.execute(UnSelectAllCartItemsDocument, { command: { ...context, cartId: cart.id } }));
    await test.step("assert: no line item is selected", () => {
      expect(unSelectAllCartItems?.items?.map((item) => item?.selectedForCheckout)).toEqual([false, false]);
    });
    const selected = lineItemOf(cart, PRODUCT_IDS[0]);
    const remaining = lineItemOf(cart, PRODUCT_IDS[1]);

    const { selectCartItems } = await test.step("act: select the first line item", () =>
      api.graphql.execute(SelectCartItemsDocument, {
        command: { ...context, cartId: cart.id, lineItemIds: [selected.id] },
      }));

    await test.step("assert: only the first line item is selected", () => {
      expect(selectCartItems?.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: selected.id, selectedForCheckout: true }),
          expect.objectContaining({ id: remaining.id, selectedForCheckout: false }),
        ]),
      );
    });
  });
});
