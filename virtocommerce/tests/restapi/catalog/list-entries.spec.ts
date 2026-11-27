import type { ArrangedCatalog, ArrangedCategory, ArrangedProduct } from "@arrange";
import type { VirtoCommerceCatalogModuleCoreModelSearchListEntrySearchResult as ListEntrySearchResult } from "@rest/generated/platform.ts";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

interface CatalogTree {
  readonly catalog: ArrangedCatalog;
  readonly category: ArrangedCategory;
  readonly product: ArrangedProduct;
}

const LIST_ENTRY_SEARCHES = [
  {
    entry: "a category",
    within: "its catalog",
    criteria: ({ catalog }: CatalogTree) => ({ catalogId: catalog.id, responseGroup: "withCategories" }),
    expected: ({ category }: CatalogTree) => category.id,
  },
  {
    entry: "a product",
    within: "its category",
    criteria: ({ catalog, category }: CatalogTree) => ({
      catalogId: catalog.id,
      categoryId: category.id,
      responseGroup: "withProducts",
    }),
    expected: ({ product }: CatalogTree) => product.id,
  },
] as const;

test.describe("catalog list entries (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  for (const { entry, within, criteria, expected } of LIST_ENTRY_SEARCHES) {
    test(`find ${entry} among the list entries of ${within}`, async ({ api, arrange }) => {
      const tree = await test.step("arrange: a catalog with a category and a product in it", async () => {
        const catalog = await arrange.catalog.catalog();
        const category = await arrange.catalog.category(catalog.id);
        return { catalog, category, product: await arrange.catalog.product(category) };
      });

      const entries = await test.step(`act: search the list entries of ${within}`, async () =>
        (await api.post("/api/catalog/listentries", { json: criteria(tree) })).expectOk().json<ListEntrySearchResult>()
          .results ?? []);

      await test.step(`assert: ${entry} is listed`, () => {
        expect(entries.map(({ id }) => id)).toContain(expected(tree));
      });
    });
  }
});
