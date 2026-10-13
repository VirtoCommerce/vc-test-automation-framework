import * as allure from "allure-js-commons";

import { ProductsDocument } from "@api/graphql/generated/graphql";
import { requireDefined } from "@core/required-fields";
import { expect, test } from "@fixtures";

const FAMILY_MAIN_ID = "product-smartphone-google-pixel-10-frost";
const FAMILY_PRICE = 799.99;
const COLOR_VARIATIONS = [
  { color: "Frost", productId: "product-smartphone-google-pixel-10-frost" },
  { color: "Indigo", productId: "product-smartphone-google-pixel-10-indigo" },
  { color: "Lemongrass", productId: "product-smartphone-google-pixel-10-lemongrass" },
  { color: "Obsidian", productId: "product-smartphone-google-pixel-10-obsidian" },
] as const;
const FAMILY_IDS: readonly string[] = COLOR_VARIATIONS.map(({ productId }) => productId);
const PRICE_RANGES = [
  { range: "(0 TO 1000)", expected: FAMILY_IDS },
  { range: "[1000 TO 1200]", expected: [] },
  { range: "[1400 TO)", expected: [] },
] as const;
const PAGE_SIZE = 100;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Catalog / Product Variations");
});

test.describe("product variation filters (anonymous)", () => {
  test("filter a product family by stock", async ({ api, store }) => {
    await allure.story("Family filters");
    await allure.description("Filtering the Pixel 10 family by stock returns every variation.");
    const { catalog } = store;

    const { products } = await test.step("act: filter the family by inStock", async () =>
      api.graphql.execute(ProductsDocument, {
        ...(await api.storeContext()),
        filter: `category.subtree:${catalog} productfamilyid:${FAMILY_MAIN_ID} is:product,variation inStock:true`,
        first: PAGE_SIZE,
      }));

    await test.step("assert: every variation of the family is in stock", () => {
      expect(
        requireDefined(products?.items, "Product")
          .map(({ id }) => id)
          .toSorted(),
      ).toEqual(FAMILY_IDS.toSorted());
    });
  });

  for (const { range, expected } of PRICE_RANGES) {
    test(`filter a product family by price ${range}`, async ({ api, store }) => {
      await allure.story("Family filters");
      await allure.description(
        `The ${FAMILY_PRICE} family is ${expected.length > 0 ? "" : "not "}in the price range ${range}.`,
      );
      const { catalog } = store;
      const context = await api.storeContext();

      const { products } = await test.step(`act: filter the family by price ${range}`, () =>
        api.graphql.execute(ProductsDocument, {
          ...context,
          filter: `category.subtree:${catalog} productfamilyid:${FAMILY_MAIN_ID} is:product,variation price.${context.currencyCode}:${range}`,
          first: PAGE_SIZE,
        }));

      await test.step(`assert: the range finds ${expected.length} variation(s)`, () => {
        expect(
          requireDefined(products?.items, "Product")
            .map(({ id }) => id)
            .toSorted(),
        ).toEqual(expected.toSorted());
      });
    });
  }

  for (const { color, productId } of COLOR_VARIATIONS) {
    test(`filter a product family by color ${color}`, async ({ api, store }) => {
      await allure.story("Family filters");
      await allure.description(
        `Filtering the family by color ${color} finds that variation and the family's main product.`,
      );
      const { catalog } = store;

      const { products } = await test.step(`act: filter the family by color ${color}`, async () =>
        api.graphql.execute(ProductsDocument, {
          ...(await api.storeContext()),
          filter: `category.subtree:${catalog} productfamilyid:${FAMILY_MAIN_ID} is:product,variation color:${color}`,
          first: PAGE_SIZE,
        }));

      await test.step(`assert: the ${color} variation and the family's main product are found`, () => {
        expect(
          requireDefined(products?.items, "Product")
            .map(({ id }) => id)
            .toSorted(),
        ).toEqual([...new Set([productId, FAMILY_MAIN_ID])].toSorted());
      });
    });
  }
});
