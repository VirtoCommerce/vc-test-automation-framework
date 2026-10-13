import * as allure from "allure-js-commons";

import { newProductPrice } from "@dataset/builders/pricing";
import { expect, test } from "@fixtures";

const DATASET_PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Pricing / Prices");
});

test.describe("prices (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("list the prices of a pricelist", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("A pricelist lists exactly the price it has.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    await test.step("arrange: the product priced at 15", () => arrange.pricing.price(pricelist, product.id, 15));

    const prices = await test.step("act: list the pricelist's prices", () =>
      api.rest.pricing.prices.listOfPricelist(pricelist.id));

    await test.step("assert: exactly the product's price is listed", () => {
      expect(prices).toEqual([expect.objectContaining({ productId: product.id, list: 15 })]);
    });
  });

  test("replace a price through the product", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A price saved through the product replaces its price in the pricelist.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    await test.step("arrange: the product priced at 10", () => arrange.pricing.price(pricelist, product.id, 10));

    await test.step("act: save the product's price as 25", () =>
      api.rest.pricing.prices.saveForProduct(newProductPrice(pricelist, product.id, 25)));

    await test.step("assert: the pricelist has only the new price", async () => {
      expect(await api.rest.pricing.prices.search({ priceListIds: [pricelist.id] })).toEqual([
        expect.objectContaining({ productId: product.id, list: 25 }),
      ]);
    });
  });

  test("delete a price by id", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A price deleted by its id leaves the pricelist empty.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    await test.step("arrange: the product priced at 5", () => arrange.pricing.price(pricelist, product.id, 5));
    const prices = await test.step("arrange: the price, as search finds it", () =>
      api.rest.pricing.prices.search({ priceListIds: [pricelist.id] }));

    await test.step("act: delete the price by its id", () =>
      api.rest.pricing.prices.delete(prices.map(({ id }) => id)));

    await test.step("assert: the pricelist has no prices", async () => {
      expect(await api.rest.pricing.prices.search({ priceListIds: [pricelist.id] })).toEqual([]);
    });
  });

  test("price products and delete their prices in bulk", async ({ api, arrange }) => {
    await allure.story("Bulk");
    await allure.description(
      "Two products priced in one request each have exactly that price in the pricelist; deleted in one request, " +
        "neither is priced.",
    );
    const productIds = await test.step("arrange: two products", async () => [
      (await arrange.catalog.catalogProduct()).id,
      (await arrange.catalog.catalogProduct()).id,
    ]);
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());

    await test.step("act: price both products at 49.99 in one request", () =>
      api.rest.pricing.prices.saveMany(productIds.map((productId) => newProductPrice(pricelist, productId, 49.99))));
    await test.step("assert: each product has exactly that price in the pricelist", async () => {
      const prices = await api.rest.pricing.prices.search({ priceListIds: [pricelist.id], productIds });
      expect(prices).toHaveLength(productIds.length);
      expect(prices).toEqual(
        expect.arrayContaining(
          productIds.map((productId) => expect.objectContaining({ pricelistId: pricelist.id, productId, list: 49.99 })),
        ),
      );
    });

    await test.step("act: delete the prices of both products in one request", () =>
      api.rest.pricing.prices.deleteOfProducts(pricelist.id, productIds));
    await test.step("assert: the pricelist has no prices", async () => {
      expect(await api.rest.pricing.prices.search({ priceListIds: [pricelist.id] })).toEqual([]);
    });
  });

  test("get the prices of a dataset product", async ({ api, dataset, store }) => {
    await allure.story("Read");
    await allure.description(`The prices of ${DATASET_PRODUCT_ID} in the store's catalog are exactly the dataset's.`);
    const expected = dataset.prices
      .filter(({ productId }) => productId === DATASET_PRODUCT_ID)
      .flatMap(({ prices }) => prices ?? [])
      .map(({ pricelistId, currency, list, minQuantity }) => ({ pricelistId, currency, list, minQuantity }));

    const prices = await test.step(`act: get the prices of ${DATASET_PRODUCT_ID}`, () =>
      api.rest.pricing.prices.listOfProduct(DATASET_PRODUCT_ID, store.catalog));

    await test.step("assert: the prices are exactly the dataset's", () => {
      expect(prices).toHaveLength(expected.length);
      expect(prices).toEqual(expect.arrayContaining(expected.map((price) => expect.objectContaining(price))));
    });
  });
});
