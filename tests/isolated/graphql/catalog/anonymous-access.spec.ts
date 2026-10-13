import * as allure from "allure-js-commons";

import {
  CategoriesDocument,
  CategoryDocument,
  ProductDocument,
  ProductsDocument,
} from "@api/graphql/generated/graphql";
import { expect, test } from "@fixtures";

const ALLOW_ANONYMOUS_USERS = "Stores.AllowAnonymousUsers";
const CATEGORY_ID = "category-acme-electronics-laptops";
const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const UNAUTHORIZED = "Unauthorized";
const PROPAGATION_TIMEOUT_MS = 60_000;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Catalog / Browsing");
});

test.describe("catalog browsing (store closed to anonymous users)", () => {
  test("anonymous catalog queries are unauthorized", async ({ api, arrange, store }) => {
    await allure.story("Anonymous access");
    await allure.description(
      `With ${ALLOW_ANONYMOUS_USERS} off, every anonymous catalog query is unauthorized. ` +
        "The store setting is global, so this test runs in the isolated project, after every other API test.",
    );
    const { catalog } = store;
    const context = await api.storeContext();
    const categories = { ...context, filter: `category.subtree:${catalog}`, first: 1 };
    await test.step(`arrange: turn ${ALLOW_ANONYMOUS_USERS} off`, () =>
      arrange.platform.storeSetting(ALLOW_ANONYMOUS_USERS, false, () =>
        expect(async () => {
          await api.graphql.execute(CategoriesDocument, categories);
        }).toPass({ timeout: PROPAGATION_TIMEOUT_MS }),
      ));

    await test.step("act: wait until anonymous category queries are rejected", () =>
      expect(async () => {
        await expect(api.graphql.execute(CategoriesDocument, categories)).rejects.toBeGraphqlError(UNAUTHORIZED);
      }).toPass({ timeout: PROPAGATION_TIMEOUT_MS }));

    await test.step("assert: category, product list and product queries are unauthorized too", async () => {
      const results = await Promise.all([
        api.graphql.executeRaw(CategoryDocument, { ...context, id: CATEGORY_ID }),
        api.graphql.executeRaw(ProductsDocument, { ...context, filter: `category.subtree:${catalog}/${CATEGORY_ID}` }),
        api.graphql.executeRaw(ProductDocument, { ...context, id: PRODUCT_ID }),
      ]);
      expect(results.map((result) => result.errors[0]?.extensions?.["code"])).toEqual([
        UNAUTHORIZED,
        UNAUTHORIZED,
        UNAUTHORIZED,
      ]);
    });
  });
});
