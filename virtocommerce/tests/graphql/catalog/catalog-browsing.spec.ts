import { ORGANIZATION_EMPLOYEE } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { CategoriesDocument, CategoryDocument, ProductDocument, ProductsDocument } from "@graphql/generated/graphql.ts";
import { requireFields } from "@support/require-fields.ts";

const CATEGORY_ID = "category-acme-electronics-laptops";

for (const { who, shopperAs } of [
  { who: "anonymous", shopperAs: "anonymous" },
  { who: "signed-in customer", shopperAs: ORGANIZATION_EMPLOYEE },
] as const) {
  test.describe(`catalog browsing (${who})`, () => {
    test.use({ shopperAs });

    test("browse from a category to a product", async ({ shopper, store }) => {
      const { catalog } = store;
      const context = shopper.storeContext;

      const { categories } = await test.step(`act: list the categories of ${catalog}`, () =>
        shopper.graphql.execute(CategoriesDocument, { ...context, filter: `category.subtree:${catalog}`, first: 50 }));
      await test.step(`assert: ${CATEGORY_ID} is listed`, () => {
        expect(categories?.items?.map((category) => category?.id)).toContain(CATEGORY_ID);
      });

      const { category } = await test.step(`act: open ${CATEGORY_ID}`, () =>
        shopper.graphql.execute(CategoryDocument, { ...context, id: CATEGORY_ID }));
      await test.step("assert: the category opens", () => {
        expect(category?.id).toBe(CATEGORY_ID);
      });

      const { products } = await test.step(`act: list the products of ${CATEGORY_ID}`, () =>
        shopper.graphql.execute(ProductsDocument, {
          ...context,
          filter: `category.subtree:${catalog}/${CATEGORY_ID}`,
        }));
      const listed = requireFields(products?.items?.[0], ["id", "name"], `First product of ${CATEGORY_ID}`);

      const { product } = await test.step(`act: open ${listed.id}`, () =>
        shopper.graphql.execute(ProductDocument, { ...context, id: listed.id }));
      await test.step("assert: the product opens with the listed name", () => {
        expect(product).toMatchObject({ id: listed.id, name: listed.name });
      });
    });
  });
}
