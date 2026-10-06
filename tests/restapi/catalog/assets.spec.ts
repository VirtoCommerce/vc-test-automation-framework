import * as allure from "allure-js-commons";

import { AssetsClient } from "@api/rest/clients/assets-client";
import { CatalogClient } from "@api/rest/clients/catalog-client";
import { uniqueId } from "@core/unique-id";
import { getProduct } from "@dataset/dataset";
import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { asWorkerAdministrator, expect, test } from "@fixtures";

const PRODUCT_ID = SEEDED_PRODUCTS.configurableLaptop;

test.beforeEach(async () => {
  await allure.feature("Catalog / Assets");
});

test.describe("catalog assets (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("add an asset to a product", async ({ httpClient, cleanupStack, dataset }) => {
    const assetsClient = new AssetsClient(httpClient);
    const catalogClient = new CatalogClient(httpClient);
    const folderName = uniqueId("test-product-assets");
    const productId = uniqueId("test-product");

    const product = await test.step("arrange: copy of a dataset product", () =>
      catalogClient.saveProduct({
        ...getProduct(dataset, PRODUCT_ID),
        id: productId,
        code: productId,
        seoInfos: [],
      }));
    cleanupStack.push(`delete product ${product.id}`, () => catalogClient.deleteProduct(product.id));

    cleanupStack.push(`remove folder ${folderName}`, () => assetsClient.removeFolder(folderName));
    const file = await test.step("arrange: uploaded file", () =>
      assetsClient.upload(folderName, {
        name: "test-asset.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Test product asset"),
      }));

    await test.step("act: attach the file to the product", () =>
      catalogClient.saveProduct({ ...product, assets: [{ name: file.name, url: file.url, group: "default" }] }));

    await test.step("assert: product has the asset", async () => {
      const { assets } = await catalogClient.getProduct(product.id);
      expect(assets).toEqual([expect.objectContaining({ name: file.name, url: file.url })]);
    });
  });
});
