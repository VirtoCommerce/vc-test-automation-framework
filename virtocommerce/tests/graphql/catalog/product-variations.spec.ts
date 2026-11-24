import { expect, test } from "@fixtures";
import { ProductsDocument } from "@graphql/generated/graphql.ts";
import { requireDefined } from "@support/require-fields.ts";

const FAMILY_MAIN_ID = "product-smartphone-google-pixel-10-frost";
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

test.describe("product variation filters (anonymous)", () => {
  test("filter a product family by stock", async ({ shopper, store }) => {
    const { catalog } = store;

    const { products } = await test.step("act: filter the family by inStock", async () =>
      shopper.graphql.execute(ProductsDocument, {
        ...shopper.storeContext,
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
    test(`filter a product family by price ${range}`, async ({ shopper, store }) => {
      const { catalog } = store;
      const context = shopper.storeContext;

      const { products } = await test.step(`act: filter the family by price ${range}`, () =>
        shopper.graphql.execute(ProductsDocument, {
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
    test(`filter a product family by color ${color}`, async ({ shopper, store }) => {
      const { catalog } = store;

      const { products } = await test.step(`act: filter the family by color ${color}`, async () =>
        shopper.graphql.execute(ProductsDocument, {
          ...shopper.storeContext,
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
