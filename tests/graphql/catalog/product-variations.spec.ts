import type { FrontendContext } from "@dataset/frontend-context";

import * as allure from "allure-js-commons";

import { searchProducts } from "@dataset/arrange/catalog";
import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { expect, test } from "@fixtures";

const FAMILY_MAIN_PRODUCT_ID = SEEDED_PRODUCTS.pixel10Frost;
const FAMILY_PRICE = 799.99;
const PRICE_RANGES = [
  { range: "(0 TO 1000)", includesFamily: true },
  { range: "[1000 TO 1200]", includesFamily: false },
  { range: "[1400 TO)", includesFamily: false },
] as const;
const COLOR_VARIATIONS = [
  { color: "Frost", productId: SEEDED_PRODUCTS.pixel10Frost },
  { color: "Indigo", productId: "smartphone-google-pixel-10-indigo" },
  { color: "Lemongrass", productId: "smartphone-google-pixel-10-lemongrass" },
  { color: "Obsidian", productId: "smartphone-google-pixel-10-obsidian" },
] as const;
const FAMILY_PRODUCT_IDS = COLOR_VARIATIONS.map(({ productId }) => productId);

test.beforeEach(async () => {
  await allure.feature("Catalog / Product Variations");
});

test.describe("product variation filters (anonymous)", () => {
  test("filter a product family by stock", async ({ graphqlClient, frontendContext }) => {
    const inStock = await test.step("act: filter the family by inStock", () =>
      searchProducts(graphqlClient, frontendContext, { filter: `${familyFilter(frontendContext)} inStock:true` }));

    await test.step("assert: every variation of the family is in stock", async () => {
      expect(inStock.map(({ id }) => id).sort()).toEqual([...FAMILY_PRODUCT_IDS].sort());
    });
  });

  for (const { range, includesFamily } of PRICE_RANGES) {
    test(`filter a product family by price ${range}`, async ({ graphqlClient, frontendContext }) => {
      const priced = await test.step(`act: filter the family by price ${range}`, () =>
        searchProducts(graphqlClient, frontendContext, {
          filter: `${familyFilter(frontendContext)} price.${frontendContext.currencyCode}:${range}`,
        }));

      await test.step(`assert: the ${FAMILY_PRICE} family is ${includesFamily ? "" : "not "}in the range`, async () => {
        expect(priced.map(({ id }) => id).sort()).toEqual(includesFamily ? [...FAMILY_PRODUCT_IDS].sort() : []);
      });
    });
  }

  for (const { color, productId } of COLOR_VARIATIONS) {
    test(`filter a product family by color ${color}`, async ({ graphqlClient, frontendContext }) => {
      const colored = await test.step(`act: filter the family by color ${color}`, () =>
        searchProducts(graphqlClient, frontendContext, { filter: `${familyFilter(frontendContext)} color:${color}` }));

      await test.step(`assert: the ${color} variation and the family's main product are found`, async () => {
        expect(colored.map(({ id }) => id).sort()).toEqual([...new Set([productId, FAMILY_MAIN_PRODUCT_ID])].sort());
      });
    });
  }
});

function familyFilter(context: FrontendContext): string {
  return `category.subtree:${context.catalogId} productfamilyid:${FAMILY_MAIN_PRODUCT_ID} is:product,variation`;
}
