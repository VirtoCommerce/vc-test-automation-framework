import type { Catalog, CatalogProduct, Category, ListEntrySearchCriteria } from "@api/rest/types/catalog";

import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

interface CatalogTree {
  readonly catalog: Catalog;
  readonly category: Category;
  readonly product: CatalogProduct;
}

const LIST_ENTRY_SEARCHES = [
  {
    entry: "a category",
    within: "its catalog",
    criteria: ({ catalog }: CatalogTree): ListEntrySearchCriteria => ({
      catalogId: catalog.id,
      responseGroup: "withCategories",
    }),
    expected: ({ category }: CatalogTree) => category.id,
  },
  {
    entry: "a product",
    within: "its category",
    criteria: ({ catalog, category }: CatalogTree): ListEntrySearchCriteria => ({
      catalogId: catalog.id,
      categoryId: category.id,
      responseGroup: "withProducts",
    }),
    expected: ({ product }: CatalogTree) => product.id,
  },
] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Catalog / List Entries");
});

test.describe("catalog list entries (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  for (const { entry, within, criteria, expected } of LIST_ENTRY_SEARCHES) {
    test(`find ${entry} among the list entries of ${within}`, async ({ api, arrange }) => {
      await allure.story("Search");
      await allure.description(`The list entries of ${within} include ${entry} created in it.`);
      const tree = await test.step("arrange: a catalog with a category and a product in it", async () => {
        const catalog = await arrange.catalog.catalog();
        const category = await arrange.catalog.category(catalog.id);
        return { catalog, category, product: await arrange.catalog.product(category) };
      });

      const entries = await test.step(`act: search the list entries of ${within}`, () =>
        api.rest.catalog.listEntries.search(criteria(tree)));

      await test.step(`assert: ${entry} is listed`, () => {
        expect(entries.map(({ id }) => id)).toContain(expected(tree));
      });
    });
  }
});
