import type { VirtoCommerceSearchModuleCoreModelIndexState as IndexState } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { requireFields } from "@support/require-fields.ts";

const INDEXES_PATH = "/api/search/indexes";
const PRODUCT_DOCUMENT = "Product";
const PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";

type IndexedDocument = Readonly<Record<string, unknown>>;

test.describe("search indexes (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("list the indexes", async ({ api }) => {
    const indexes = await test.step("act: list the indexes", async () =>
      (await api.get(INDEXES_PATH)).expectOk().json<IndexState[]>());

    await test.step(`assert: the ${PRODUCT_DOCUMENT} index is listed`, () => {
      expect(indexes.map(({ documentType }) => documentType)).toContain(PRODUCT_DOCUMENT);
    });
  });

  test("get the indexed document of a product", async ({ api, dataset }) => {
    const { code } = requireFields(dataset.products.get(PRODUCT_ID), ["code"], PRODUCT_ID);

    const documents = await test.step(`act: get the documents of ${PRODUCT_ID}`, () => indexedDocuments(api));

    await test.step("assert: exactly one document, with the product's code", () => {
      expect(documents).toEqual([expect.objectContaining({ code })]);
    });
  });
});

async function indexedDocuments(api: HttpClient): Promise<IndexedDocument[]> {
  const response = await api.get(`${INDEXES_PATH}/index/${PRODUCT_DOCUMENT}/${PRODUCT_ID}`);
  return response.expectOk().json<IndexedDocument[]>();
}
