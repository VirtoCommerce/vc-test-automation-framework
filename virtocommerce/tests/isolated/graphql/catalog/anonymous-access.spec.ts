import { expect, test } from "@fixtures";
import { CategoriesDocument, CategoryDocument, ProductDocument, ProductsDocument } from "@graphql/generated/graphql.ts";
import { DESTRUCTIVE_TAG } from "@virtocommerce/test-automation-framework/core";

const ALLOW_ANONYMOUS_USERS = "Stores.AllowAnonymousUsers";
const CATEGORY_ID = "category-acme-electronics-laptops";
const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const UNAUTHORIZED = "Unauthorized";
const PROPAGATION_TIMEOUT_MS = 60_000;

test.describe("catalog browsing (store closed to anonymous users)", { tag: DESTRUCTIVE_TAG }, () => {
  test("anonymous catalog queries are unauthorized", async ({ shopper, arrange, store }) => {
    const context = shopper.storeContext;
    const categories = { ...context, filter: `category.subtree:${store.catalog}`, first: 1 };
    await test.step(`arrange: turn ${ALLOW_ANONYMOUS_USERS} off`, () =>
      arrange.platform.storeSetting(ALLOW_ANONYMOUS_USERS, false, () =>
        expect(async () => {
          await shopper.graphql.execute(CategoriesDocument, categories);
        }).toPass({ timeout: PROPAGATION_TIMEOUT_MS }),
      ));

    await test.step("act: wait until anonymous category queries are rejected", () =>
      expect(async () => {
        await expect(shopper.graphql.execute(CategoriesDocument, categories)).rejects.toThrow(`[${UNAUTHORIZED}]`);
      }).toPass({ timeout: PROPAGATION_TIMEOUT_MS }));

    await test.step("assert: category, product list and product queries are unauthorized too", async () => {
      const results = await Promise.all([
        shopper.graphql.executeRaw(CategoryDocument, { ...context, id: CATEGORY_ID }),
        shopper.graphql.executeRaw(ProductsDocument, {
          ...context,
          filter: `category.subtree:${store.catalog}/${CATEGORY_ID}`,
        }),
        shopper.graphql.executeRaw(ProductDocument, { ...context, id: PRODUCT_ID }),
      ]);
      expect(results.map((result) => result.errors[0]?.extensions?.["code"])).toEqual([
        UNAUTHORIZED,
        UNAUTHORIZED,
        UNAUTHORIZED,
      ]);
    });
  });
});
