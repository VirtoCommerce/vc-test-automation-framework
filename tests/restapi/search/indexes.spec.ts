import * as allure from "allure-js-commons";

import { requireFields } from "@core/required-fields";
import { expect, test } from "@fixtures";

const PRODUCT_DOCUMENT = "Product";
const PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Search / Indexes");
});

test.describe("search indexes (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("list the indexes", async ({ api }) => {
    await allure.story("Indexes");
    await allure.description("The product index is one of the platform's search indexes.");

    const indexes = await test.step("act: list the indexes", () => api.rest.searchIndexes.list());

    await test.step(`assert: the ${PRODUCT_DOCUMENT} index is listed`, () => {
      expect(indexes.map(({ documentType }) => documentType)).toContain(PRODUCT_DOCUMENT);
    });
  });

  test("get the indexed document of a product", async ({ api, dataset }) => {
    await allure.story("Documents");
    await allure.description(`${PRODUCT_ID} is indexed as exactly one document, with its code.`);
    const { code } = requireFields(dataset.products.get(PRODUCT_ID), ["code"], PRODUCT_ID);

    const documents = await test.step(`act: get the documents of ${PRODUCT_ID}`, () =>
      api.rest.searchIndexes.getDocuments(PRODUCT_DOCUMENT, PRODUCT_ID));

    await test.step("assert: exactly one document, with the product's code", () => {
      expect(documents).toEqual([expect.objectContaining({ code })]);
    });
  });
});
