import { expect, test } from "@fixtures";
import { SlugInfoDocument } from "@graphql/generated/graphql.ts";
import { requireDefined } from "@support/require-fields.ts";

const CATEGORY_ID = "category-acme-electronics-smartphones";
const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";

test.describe("SEO slugs (anonymous)", () => {
  test("resolve a category slug", async ({ shopper, dataset }) => {
    const [seo] = requireDefined(dataset.categories.get(CATEGORY_ID).seoInfos, "Category SEO info");
    const slug = String(seo?.semanticUrl);
    const { storeId, userId, cultureName } = shopper.storeContext;

    const { slugInfo } = await test.step(`act: resolve the slug "${slug}"`, () =>
      shopper.graphql.execute(SlugInfoDocument, { storeId, userId, cultureName, slug }));

    await test.step("assert: the slug resolves to the category", () => {
      expect(slugInfo?.entityInfo).toMatchObject({ objectId: CATEGORY_ID, objectType: "Category", semanticUrl: slug });
    });
  });

  test("resolve a product permalink", async ({ shopper, dataset }) => {
    const [categorySeo] = requireDefined(dataset.categories.get(CATEGORY_ID).seoInfos, "Category SEO info");
    const [productSeo] = requireDefined(dataset.products.get(PRODUCT_ID).seoInfos, "Product SEO info");
    const permalink = `${categorySeo?.semanticUrl}/${productSeo?.semanticUrl}`;
    const { storeId, userId, cultureName } = shopper.storeContext;

    const { slugInfo } = await test.step(`act: resolve the permalink "${permalink}"`, () =>
      shopper.graphql.execute(SlugInfoDocument, { storeId, userId, cultureName, permalink }));

    await test.step("assert: the permalink resolves to the active product page", () => {
      expect(slugInfo?.entityInfo).toMatchObject({
        objectId: PRODUCT_ID,
        objectType: "CatalogProduct",
        semanticUrl: productSeo?.semanticUrl,
        storeId,
        isActive: true,
        languageCode: cultureName,
        pageTitle: expect.any(String),
      });
    });
  });
});
