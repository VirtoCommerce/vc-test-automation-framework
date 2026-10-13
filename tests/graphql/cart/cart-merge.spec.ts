import * as allure from "allure-js-commons";

import { AddItemsCartDocument, MergeCartDocument } from "@api/graphql/generated/graphql";
import { lineItemOf } from "@api/graphql/line-items";
import { requireFields } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";
import { configuredSku, optionOfEachSection } from "@dataset/builders/product-configuration";
import { expect, test } from "@fixtures";

const CUSTOMER = "acme_store_employee_1@acme.com";
const PRODUCT_IDS = [
  "product-smartphone-apple-iphone-17-256gb-black",
  "product-smartphone-apple-iphone-17-256gb-mist-blue",
] as const;
const REGULAR_PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const CONFIGURABLE_PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Merge");
});

test.describe("cart merge (anonymous, then signed in)", () => {
  test("merge an anonymous cart into a signed-in customer's cart", async ({ api, arrange }) => {
    await allure.story("Merge carts");
    await allure.description("After signing in, the anonymous cart's items move into the customer's cart.");
    const anonymousCart = await test.step("arrange: anonymous cart with two products", () =>
      arrange.carts.cart(api, [
        { productId: PRODUCT_IDS[0], quantity: 2 },
        { productId: PRODUCT_IDS[1], quantity: 1 },
      ]));
    const customer = await test.step(`arrange: sign in as ${CUSTOMER}`, () => api.as(CUSTOMER));

    const { mergeCart } = await test.step("act: merge the anonymous cart into the customer's cart", async () =>
      customer.graphql.execute(MergeCartDocument, {
        command: {
          ...(await customer.storeContext()),
          cartName: uniqueId("test-cart"),
          secondCartId: anonymousCart.id,
        },
      }));
    await arrange.carts.removeCartLater(customer, requireFields(mergeCart, ["id"], "Merged cart").id);

    await test.step("assert: the customer's cart has the anonymous cart's items", () => {
      expect(mergeCart?.itemsCount).toBe(2);
      expect(lineItemOf(mergeCart, PRODUCT_IDS[0]).quantity).toBe(2);
      expect(lineItemOf(mergeCart, PRODUCT_IDS[1]).quantity).toBe(1);
    });
  });

  test("merge a cart with a configured item into a cart with a regular item", async ({ api, arrange, dataset }) => {
    await allure.story("Merge carts");
    await allure.description("A configured item of the anonymous cart keeps its components after the merge.");
    const selection = optionOfEachSection(await arrange.catalog.productConfiguration(api, CONFIGURABLE_PRODUCT_ID));
    const anonymousCart = await test.step("arrange: anonymous cart with the configured product", () =>
      arrange.carts.cart(api, [{ productId: CONFIGURABLE_PRODUCT_ID, quantity: 1 }], {
        configurationSections: selection,
      }));
    const customer = await test.step(`arrange: sign in as ${CUSTOMER}`, () => api.as(CUSTOMER));
    const context = await customer.storeContext();
    const cartName = uniqueId("test-cart");
    await test.step("arrange: the customer's cart with a regular product ×2", async () => {
      const { addItemsCart } = await customer.graphql.execute(AddItemsCartDocument, {
        command: { ...context, cartName, cartItems: [{ productId: REGULAR_PRODUCT_ID, quantity: 2 }] },
      });
      await arrange.carts.removeCartLater(customer, requireFields(addItemsCart, ["id"], "Customer cart").id);
    });

    const { mergeCart } = await test.step("act: merge the anonymous cart into the customer's cart", () =>
      customer.graphql.execute(MergeCartDocument, {
        command: { ...context, cartName, secondCartId: anonymousCart.id },
      }));

    await test.step("assert: the merged cart has the regular and the configured item", () => {
      const configured = lineItemOf(mergeCart, CONFIGURABLE_PRODUCT_ID);
      expect(mergeCart?.itemsCount).toBe(2);
      expect(lineItemOf(mergeCart, REGULAR_PRODUCT_ID).quantity).toBe(2);
      expect(configured.sku).toBe(configuredSku(String(dataset.products.get(CONFIGURABLE_PRODUCT_ID).code)));
      expect(new Set(configured.configurationItems?.map((item) => item?.productId))).toEqual(
        new Set(selection.map(({ option }) => option?.productId)),
      );
    });
  });
});
