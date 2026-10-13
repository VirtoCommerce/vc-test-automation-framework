import * as allure from "allure-js-commons";

import { ProductsDocument } from "@api/graphql/generated/graphql";
import { requireDefined, requireFields } from "@core/required-fields";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-google-pixel-10-pro-jade";
const SMARTPHONES_ID = "category-acme-electronics-smartphones";
const BRAND = "Google";
const PAGE_SIZE = 100;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Catalog / Search");
});

test.describe("catalog search (anonymous)", () => {
  for (const { by, text } of [
    { by: "its full name", text: (product: { name: string; code: string }) => product.name },
    { by: "a fragment of its name", text: (product: { name: string; code: string }) => product.name.slice(0, 11) },
    { by: "its code", text: (product: { name: string; code: string }) => product.code },
  ]) {
    test(`find a product by ${by}`, async ({ api, dataset }) => {
      await allure.story("Search by text");
      await allure.description(`Searching a product by ${by} finds it.`);
      const query = text(requireFields(dataset.products.get(PRODUCT_ID), ["name", "code"], PRODUCT_ID));

      const { products } = await test.step(`act: search "${query}"`, async () =>
        api.graphql.execute(ProductsDocument, { ...(await api.storeContext()), query, first: PAGE_SIZE }));

      await test.step("assert: the product is found on a page that is not full", () => {
        const found = requireDefined(products?.items, "Found product");
        expect(found.length).toBeLessThan(PAGE_SIZE);
        expect(found.map(({ id }) => id)).toContain(PRODUCT_ID);
      });
    });
  }

  test("filter a category by availability", async ({ api, store }) => {
    await allure.story("Filters");
    await allure.description("Filtering a category by InStock returns a smaller, non-empty part of it.");
    const { catalog } = store;
    const category = `category.subtree:${catalog}/${SMARTPHONES_ID}`;
    const context = await api.storeContext();
    const { products: all } = await test.step("arrange: every product of the category", () =>
      api.graphql.execute(ProductsDocument, { ...context, filter: category, first: PAGE_SIZE }));

    const { products: inStock } = await test.step("act: filter the category by InStock", () =>
      api.graphql.execute(ProductsDocument, {
        ...context,
        filter: `${category} availability:InStock`,
        first: PAGE_SIZE,
      }));

    await test.step("assert: the in-stock products are a smaller, non-empty part of the category", () => {
      const allIds = requireDefined(all?.items, "Product").map(({ id }) => id);
      const inStockIds = requireDefined(inStock?.items, "In-stock product").map(({ id }) => id);
      expect(inStockIds.length).toBeGreaterThan(0);
      expect(inStockIds.length).toBeLessThan(allIds.length);
      expect(allIds).toEqual(expect.arrayContaining(inStockIds));
    });
  });

  test("filter a category by brand", async ({ api, dataset, store }) => {
    await allure.story("Filters");
    await allure.description(
      `Filtering a category's products and variations by brand ${BRAND} returns exactly the dataset's ${BRAND} products.`,
    );
    const { catalog } = store;
    const expected = dataset.products
      .filter(
        (product) =>
          product.categoryId === SMARTPHONES_ID &&
          product.properties?.some(
            (property) =>
              property.name === "Brand" && property.values?.some((value) => String(value.value) === BRAND) === true,
          ) === true,
      )
      .map(({ id }) => id);

    const { products } = await test.step(`act: filter the category by brand ${BRAND}`, async () =>
      api.graphql.execute(ProductsDocument, {
        ...(await api.storeContext()),
        filter: `category.subtree:${catalog}/${SMARTPHONES_ID} is:product,variation brand:${BRAND}`,
        first: PAGE_SIZE,
      }));

    await test.step(`assert: exactly the ${BRAND} products of the category are returned`, () => {
      const foundIds = requireDefined(products?.items, "Branded product").map(({ id }) => id);
      expect(expected.length).toBeGreaterThan(0);
      expect(foundIds.toSorted()).toEqual(expected.toSorted());
    });
  });
});
