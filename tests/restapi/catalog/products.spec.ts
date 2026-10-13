import type { ProductImage } from "@api/rest/types/catalog";

import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { newProduct } from "@dataset/builders/catalog";
import { textFile } from "@dataset/builders/files";
import { expect, test } from "@fixtures";

const IMAGE = {
  name: "test-image.svg",
  url: "/test-images/test-image.svg",
  relativeUrl: "/test-images/test-image.svg",
  group: "images",
  sortOrder: 1,
} satisfies ProductImage;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Catalog / Products");
});

test.describe("products (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("create a product", async ({ api, arrange }) => {
    await allure.story("Create");
    await allure.description("A new product belongs to its catalog and category, with its name and code.");
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const category = await test.step("arrange: a category", () => arrange.catalog.category(catalog.id));
    const draft = newProduct(catalog.id, category.id);

    const product = await test.step("act: create a product", () => api.rest.catalog.products.save(draft));

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
    await allure.story("Create");
    await allure.description("A product's clone saved with a new code becomes a separate product.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const clone = await test.step("arrange: a clone of the product", () =>
      api.rest.catalog.products.cloneTemplate(product.id));
    const code = uniqueId("test-product-clone");

    const created = await test.step("act: save the clone with a new code", () =>
      api.rest.catalog.products.save({ ...clone, id: null, code }));

    await test.step("assert: the clone is a separate product of the same catalog", () => {
      expect(created.id).not.toBe(product.id);
      expect(created).toMatchObject({ code, name: product.name, catalogId: product.catalogId });
    });
  });

  test("get a product by id", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("A product is read back by its id with the fields it was created with.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());

    const reloaded = await test.step("act: get the product", () => api.rest.catalog.products.get(product.id));

    await test.step("assert: the fields match the created product", () => {
      expect(reloaded).toMatchObject({ id: product.id, name: product.name, code: product.code });
    });
  });

  test("get a missing product", async ({ api }) => {
    await allure.story("Read");
    await allure.description("Looking a product up by an id that does not exist finds nothing.");

    const product = await test.step("act: look a product up by an unknown id", () =>
      api.rest.catalog.products.find(uniqueId("test-missing-product")));

    await test.step("assert: no product is found", () => {
      expect(product).toBeUndefined();
    });
  });

  test("rename a product and change its weight", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A product's new name and weight are stored.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const newName = `${product.name}-renamed`;

    await test.step("act: rename the product and set its weight to 2.5", () =>
      api.rest.catalog.products.save({ ...product, name: newName, weight: 2.5 }));

    await test.step("assert: the product has the new name and weight", async () => {
      expect(await api.rest.catalog.products.get(product.id)).toMatchObject({ name: newName, weight: 2.5 });
    });
  });

  test("add an image to a product", async ({ api, arrange }) => {
    await allure.story("Media");
    await allure.description("An image attached to a product is stored with the product.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());

    await test.step("act: attach an image", () => api.rest.catalog.products.save({ ...product, images: [IMAGE] }));

    await test.step("assert: the product has the image", async () => {
      const { images } = await api.rest.catalog.products.get(product.id);
      expect(images?.map(({ url }) => url)).toContainEqual(expect.stringContaining(IMAGE.url));
    });
  });

  test("add an asset to a product", async ({ api, arrange }) => {
    await allure.story("Media");
    await allure.description("A file uploaded to the platform's assets and attached to a product is stored with it.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const { file } = await test.step("arrange: an uploaded file", () =>
      arrange.content.asset(textFile("test-asset.txt", "Test product asset")));

    await test.step("act: attach the file to the product", () =>
      api.rest.catalog.products.save({ ...product, assets: [{ name: file.name, url: file.url, group: "default" }] }));

    await test.step("assert: the product has the asset", async () => {
      const { assets } = await api.rest.catalog.products.get(product.id);
      expect(assets).toEqual([expect.objectContaining({ name: file.name, url: file.url })]);
    });
  });

  test("move a product to another catalog", async ({ api, arrange }) => {
    await allure.story("Move");
    await allure.description("A product moved as a list entry belongs to the target catalog.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const target = await test.step("arrange: a target catalog", () => arrange.catalog.catalog());

    await test.step("act: move the product to the target catalog", () =>
      api.rest.catalog.listEntries.move({
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
      }));

    await test.step("assert: the product is in the target catalog", async () => {
      expect((await api.rest.catalog.products.get(product.id)).catalogId).toBe(target.id);
    });
  });

  test("delete a product", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A product deleted as a list entry is no longer found.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());

    await test.step("act: delete the product", () => api.rest.catalog.listEntries.delete([product.id]));

    await test.step("assert: the product is not found", async () => {
      expect(await api.rest.catalog.products.find(product.id)).toBeUndefined();
    });
  });
});
