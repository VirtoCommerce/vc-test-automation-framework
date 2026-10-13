import * as allure from "allure-js-commons";

import { SlugInfoDocument } from "@api/graphql/generated/graphql";
import { requireDefined } from "@core/required-fields";
import { expect, test } from "@fixtures";

const CATEGORY_ID = "category-acme-electronics-smartphones";
const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Catalog / SEO");
});

test.describe("SEO slugs (anonymous)", () => {
  test("resolve a category slug", async ({ api, dataset }) => {
    await allure.story("Slugs");
    await allure.description("A category's slug resolves to that category.");
    const [seo] = requireDefined(dataset.categories.get(CATEGORY_ID).seoInfos, "Category SEO info");
    const slug = String(seo?.semanticUrl);
    const { storeId, userId, cultureName } = await api.storeContext();

    const { slugInfo } = await test.step(`act: resolve the slug "${slug}"`, () =>
      api.graphql.execute(SlugInfoDocument, { storeId, userId, cultureName, slug }));

    await test.step("assert: the slug resolves to the category", () => {
      expect(slugInfo?.entityInfo).toMatchObject({ objectId: CATEGORY_ID, objectType: "Category", semanticUrl: slug });
    });
  });

  test("resolve a product permalink", async ({ api, dataset }) => {
    await allure.story("Slugs");
    await allure.description(
      "A product's permalink, its category slug and its own slug, resolves to the active product.",
    );
    const [categorySeo] = requireDefined(dataset.categories.get(CATEGORY_ID).seoInfos, "Category SEO info");
    const [productSeo] = requireDefined(dataset.products.get(PRODUCT_ID).seoInfos, "Product SEO info");
    const permalink = `${categorySeo?.semanticUrl}/${productSeo?.semanticUrl}`;
    const { storeId, userId, cultureName } = await api.storeContext();

    const { slugInfo } = await test.step(`act: resolve the permalink "${permalink}"`, () =>
      api.graphql.execute(SlugInfoDocument, { storeId, userId, cultureName, permalink }));

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
