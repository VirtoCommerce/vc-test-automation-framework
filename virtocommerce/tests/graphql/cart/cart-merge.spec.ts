import { configuredSku, optionOfEachSection, productConfiguration } from "@builders/product-configuration.ts";
import { dataset } from "@dataset/index.ts";
import { expect, test } from "@fixtures";
import { MergeCartDocument } from "@graphql/generated/graphql.ts";
import { lineItemOf } from "@graphql/line-items.ts";

const PRODUCT_IDS = [
  "product-smartphone-apple-iphone-17-256gb-black",
  "product-smartphone-apple-iphone-17-256gb-mist-blue",
] as const;
const REGULAR_PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const CONFIGURABLE_PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";

test.describe("cart merge (anonymous, then signed in)", () => {
  test("merge an anonymous cart into a signed-in customer's cart", async ({ shopper, arrange }) => {
    const anonymousCart = await test.step("arrange: anonymous cart with two products", () =>
      arrange.carts.cart(shopper, [
        { productId: PRODUCT_IDS[0], quantity: 2 },
        { productId: PRODUCT_IDS[1], quantity: 1 },
      ]));
    const customer = await test.step("arrange: a customer", () => arrange.customers.customer());

    const { mergeCart } = await test.step("act: merge the anonymous cart into the customer's cart", () =>
      customer.graphql.execute(MergeCartDocument, {
        command: { ...customer.storeContext, secondCartId: anonymousCart.id },
      }));

    await test.step("assert: the customer's cart has the anonymous cart's items", () => {
      expect(mergeCart?.itemsCount).toBe(2);
      expect(lineItemOf(mergeCart, PRODUCT_IDS[0]).quantity).toBe(2);
      expect(lineItemOf(mergeCart, PRODUCT_IDS[1]).quantity).toBe(1);
    });
  });

  test("merge a cart with a configured item into a cart with a regular item", async ({ shopper, arrange }) => {
    const selection = optionOfEachSection(await productConfiguration(shopper, CONFIGURABLE_PRODUCT_ID));
    const anonymousCart = await test.step("arrange: anonymous cart with the configured product", () =>
      arrange.carts.cart(shopper, [
        { productId: CONFIGURABLE_PRODUCT_ID, quantity: 1, configurationSections: selection },
      ]));
    const customer = await test.step("arrange: a customer with a regular product ×2", async () => {
      const created = await arrange.customers.customer();
      await arrange.carts.cart(created, [{ productId: REGULAR_PRODUCT_ID, quantity: 2 }]);
      return created;
    });

    const { mergeCart } = await test.step("act: merge the anonymous cart into the customer's cart", () =>
      customer.graphql.execute(MergeCartDocument, {
        command: { ...customer.storeContext, secondCartId: anonymousCart.id },
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
