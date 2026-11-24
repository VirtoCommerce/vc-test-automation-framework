import type {
  VirtoCommerceCatalogModuleCoreModelCatalogProduct as CatalogProduct,
  VirtoCommerceCatalogModuleCoreModelImage as ProductImage,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newProduct } from "@builders/catalog.ts";
import { textFile } from "@builders/files.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { uniqueId } from "@support/unique-id.ts";

const PRODUCTS_PATH = "/api/catalog/products";
const IMAGE = {
  name: "test-image.svg",
  url: "/test-images/test-image.svg",
  relativeUrl: "/test-images/test-image.svg",
  group: "images",
  sortOrder: 1,
} satisfies ProductImage;

test.describe("products (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create a product", async ({ api, arrange }) => {
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const category = await test.step("arrange: a category", () => arrange.catalog.category(catalog.id));
    const draft = newProduct(catalog.id, category.id);

    const product = await test.step("act: create a product", () => saveProduct(api, draft));

    await test.step("assert: the product is in the category", () => {
      expect(product).toMatchObject({
        name: draft.name,
        code: draft.code,
        catalogId: catalog.id,
        categoryId: category.id,
      });
    });
  });

  test("save a product clone as a new product", async ({ api, arrange }) => {
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const clone = await test.step("arrange: a clone of the product", async () =>
      (await api.get(`${PRODUCTS_PATH}/${product.id}/clone`)).expectOk().json<CatalogProduct>());
    const code = uniqueId("test-product-clone");

    const created = await test.step("act: save the clone with a new code", () =>
      saveProduct(api, { ...clone, id: null, code }));

    await test.step("assert: the clone is a separate product of the same catalog", () => {
      expect(created.id).not.toBe(product.id);
      expect(created).toMatchObject({ code, name: product.name, catalogId: product.catalogId });
    });
  });

  test("get a product by id", async ({ api, arrange }) => {
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());

    const reloaded = await test.step("act: get the product", () => productOf(api, product.id));

    await test.step("assert: the fields match the created product", () => {
      expect(reloaded).toMatchObject({ id: product.id, name: product.name, code: product.code });
    });
  });

  test("get a missing product", async ({ api }) => {
    const product = await test.step("act: look a product up by an unknown id", () =>
      productOf(api, uniqueId("test-missing-product")));

    await test.step("assert: no product is found", () => {
      expect(product).toBeUndefined();
    });
  });

  test("rename a product and change its weight", async ({ api, arrange }) => {
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const newName = `${product.name}-renamed`;

    await test.step("act: rename the product and set its weight to 2.5", () =>
      saveProduct(api, { ...product, name: newName, weight: 2.5 }));

    await test.step("assert: the product has the new name and weight", async () => {
      expect(await productOf(api, product.id)).toMatchObject({ name: newName, weight: 2.5 });
    });
  });

  test("add an image to a product", async ({ api, arrange }) => {
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());

    await test.step("act: attach an image", () => saveProduct(api, { ...product, images: [IMAGE] }));

    await test.step("assert: the product has the image", async () => {
      const images = (await productOf(api, product.id))?.images;
      expect(images?.map(({ url }) => url)).toContainEqual(expect.stringContaining(IMAGE.url));
    });
  });

  test("add an asset to a product", async ({ api, arrange }) => {
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const { file } = await test.step("arrange: an uploaded file", () =>
      arrange.content.asset(textFile("test-asset.txt", "Test product asset")));

    await test.step("act: attach the file to the product", () =>
      saveProduct(api, { ...product, assets: [{ name: file.name, url: file.url, group: "default" }] }));

    await test.step("assert: the product has the asset", async () => {
      const assets = (await productOf(api, product.id))?.assets;
      expect(assets).toEqual([expect.objectContaining({ name: file.name, url: file.url })]);
    });
  });

  test("move a product to another catalog", async ({ api, arrange }) => {
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const target = await test.step("arrange: a target catalog", () => arrange.catalog.catalog());

    await test.step("act: move the product to the target catalog", async () =>
      (
        await api.post("/api/catalog/listentries/move", {
          json: {
            catalog: target.id,
            listEntries: [
              {
                id: product.id,
                type: "product",
                name: product.name,
                code: product.code,
                catalogId: product.catalogId,
                isActive: true,
              },
            ],
          },
        })
      ).expectOk());

    await test.step("assert: the product is in the target catalog", async () => {
      expect((await productOf(api, product.id))?.catalogId).toBe(target.id);
    });
  });

  test("delete a product", async ({ api, arrange }) => {
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());

    await test.step("act: delete the product", async () =>
      (await api.post("/api/catalog/listentries/delete", { json: { objectIds: [product.id] } })).expectOk());

    await test.step("assert: the product is not found", async () => {
      expect(await productOf(api, product.id)).toBeUndefined();
    });
  });
});

async function saveProduct(api: HttpClient, product: CatalogProduct): Promise<CatalogProduct> {
  return (await api.post(PRODUCTS_PATH, { json: product })).expectOk().json<CatalogProduct>();
}

async function productOf(api: HttpClient, id: string): Promise<CatalogProduct | undefined> {
  return (await api.get(PRODUCTS_PATH, { query: { ids: id } })).optionalJson<CatalogProduct[]>()?.[0];
}
