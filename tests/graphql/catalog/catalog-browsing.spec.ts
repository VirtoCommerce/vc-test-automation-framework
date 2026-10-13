import * as allure from "allure-js-commons";

import {
  CategoriesDocument,
  CategoryDocument,
  ProductDocument,
  ProductsDocument,
} from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";
import { expect, test } from "@fixtures";

const CATEGORY_ID = "category-acme-electronics-laptops";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Catalog / Browsing");
});

for (const { shopper, user } of [
  { shopper: "anonymous", user: undefined },
  { shopper: "signed-in customer", user: "acme_store_employee_1@acme.com" },
] as const) {
  test.describe(`catalog browsing (${shopper})`, () => {
    test.use({ user });

    test("browse from a category to a product", async ({ api, store }) => {
      await allure.story("Browse");
      await allure.description(
        `A ${shopper} lists the catalog's categories, opens a category, lists its products and opens one.`,
      );
      const { catalog } = store;
      const context = await api.storeContext();

      const { categories } = await test.step(`act: list the categories of ${catalog}`, () =>
        api.graphql.execute(CategoriesDocument, { ...context, filter: `category.subtree:${catalog}`, first: 50 }));
      await test.step(`assert: ${CATEGORY_ID} is listed`, () => {
        expect(categories?.items?.map((category) => category?.id)).toContain(CATEGORY_ID);
      });

      const { category } = await test.step(`act: open ${CATEGORY_ID}`, () =>
        api.graphql.execute(CategoryDocument, { ...context, id: CATEGORY_ID }));
      await test.step("assert: the category opens", () => {
        expect(category?.id).toBe(CATEGORY_ID);
      });

      const { products } = await test.step(`act: list the products of ${CATEGORY_ID}`, () =>
        api.graphql.execute(ProductsDocument, { ...context, filter: `category.subtree:${catalog}/${CATEGORY_ID}` }));
      const listed = requireFields(products?.items?.[0], ["id", "name"], `First product of ${CATEGORY_ID}`);

      const { product } = await test.step(`act: open ${listed.id}`, () =>
        api.graphql.execute(ProductDocument, { ...context, id: listed.id }));
      await test.step("assert: the product opens with the listed name", () => {
        expect(product).toMatchObject({ id: listed.id, name: listed.name });
      });
    });
  });
}
